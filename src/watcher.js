import Logger from "https://deno.land/x/logger@v1.1.1/logger.ts";

const logger = new Logger();

let logPrefix = "";

const txidCache = {};

async function fiatConversion(networkSettings, symbol, amount) {
  logger.info(
    `${logPrefix}Converting ${Math.abs(amount)} ${symbol} to fiat (USD).`
  );

  const url = `${networkSettings.priceConversionApi.url}?symbol=${symbol}&amount=${amount}&convert=USD`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-CMC_PRO_API_KEY": networkSettings.priceConversionApi.token,
      },
    });
    const data = await response.json();

    if (data.data[symbol].quote.USD.price != null) {
      logger.info(
        `${logPrefix}Conversion result: US$ ${data.data[symbol].quote.USD.price}`
      );
      return data.data[symbol].quote.USD.price;
    } else {
      logger.error(
        `${logPrefix}Conversion failed with status code ${data.status.error_code}: ${data.status.error_message}`
      );
      return null;
    }
  } catch (error) {
    logger.error(`${logPrefix}Error fetching conversion data: ${error}`);
    return null;
  }
}

async function processTransaction(networkSettings, payload) {
  logger.info(`${logPrefix}Processing transaction.`);

  const fiat =
    (await fiatConversion(
      networkSettings,
      networkSettings.symbol,
      payload.data.balance_change
    )) ?? "N/A";

  return {
    ...networkSettings.webhookTemplate,
    embeds: [
      {
        ...networkSettings.webhookTemplate.embeds[0],
        url: `${networkSettings.blockExplorerUrl}${payload.data.txid}`,
        thumbnail: { url: networkSettings.networkIcon },
        fields: [
          {
            ...networkSettings.webhookTemplate.embeds[0].fields[0],
            value: networkSettings.symbol,
          },
          {
            ...networkSettings.webhookTemplate.embeds[0].fields[1],
            value: payload.data.balance_change,
          },
          {
            ...networkSettings.webhookTemplate.embeds[0].fields[2],
            value: `US$ ${fiat}`,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function dispatchWebhook(networkSettings, payload) {
  logger.info(`${logPrefix}Dispatching webhook.`);

  try {
    const response = await fetch(networkSettings.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error(
        `${logPrefix}Webhook dispatch failed with status code ${response.status}.`
      );
    } else {
      logger.info(`${logPrefix}Webhook dispatched successfully.`);
    }
  } catch (error) {
    logger.error(`${logPrefix}Webhook dispatch failed: ${error}`);
  }
}

function setupWorker(networkSettings) {
  const ping = JSON.stringify({ type: "ping" });
  const hoseSettings = JSON.stringify({
    network: networkSettings.name,
    type: "address",
    address: networkSettings.address,
  });

  logger.info(
    `${logPrefix}Connecting to ${networkSettings.name}'s event hose.`
  );

  const ws = new WebSocket(networkSettings.apiUrl);

  ws.onopen = () => {
    logger.info(`${logPrefix}Connection established.`);
    logger.info(
      `${logPrefix}Subscribing to address ${networkSettings.address}.`
    );
    ws.send(hoseSettings);
    setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(ping);
      } else {
        setTimeout(() => {
          setupWorker(networkSettings);
        }, networkSettings.retryInterval);
      }
    }, networkSettings.pingInterval);
  };

  ws.onerror = (event) => {
    if (event.error) {
      logger.error(`An error occurred: ${event.error}`);
    }
  };

  ws.onmessage = async (event) => {
    const payload = JSON.parse(event.data);
    switch (payload.type) {
      case "address":
        try {
          if (txidCache[payload.data.txid] == null) {
            logger.info(
              `${logPrefix}Transaction ${payload.data.txid} initiated.`
            );
            txidCache[payload.data.txid] = 0;
            const webhookPayload = await processTransaction(
              networkSettings,
              payload
            );
            await dispatchWebhook(networkSettings, webhookPayload);
          } else if (txidCache[payload.data.txid] < 1) {
            logger.info(
              `${logPrefix}Transaction ${payload.data.txid} is validating.`
            );
            txidCache[payload.data.txid]++;
            break;
          } else {
            logger.info(
              `${logPrefix}Transaction ${payload.data.txid} is confirmed.`
            );
            delete txidCache[payload.data.txid];
            break;
          }
        } catch (error) {
          logger.error(`${logPrefix}Webhook dispatch failed: ${error}`);
        }
        break;
      default:
        if (payload.status) {
          logger.info(`${logPrefix}Received status report: ${payload.status}.`);
        }
        break;
    }
  };

  ws.onclose = () => {
    logger.info(
      `${logPrefix}Connection closed. Retrying in ${networkSettings.retryInterval} milliseconds.`
    );
    setTimeout(() => {
      setupWorker(networkSettings);
    }, networkSettings.retryInterval);
  };
}

self.onmessage = (event) => {
  logger.info(`Wearing ${event.data.name} watcher's identity.`);
  logPrefix = "[" + event.data.name + " watcher] ";
  setupWorker(event.data);
};

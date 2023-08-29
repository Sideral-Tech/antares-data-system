import Logger from "https://deno.land/x/logger@v1.1.2/logger.ts";

const logger = new Logger();

async function loadSettings(path) {
  logger.info("Loading settings.");
  return JSON.parse(await Deno.readTextFile(path));
}

function setupWatcher(networkSettings) {
  new Worker(new URL("./src/watcher.js", import.meta.url).href, {
    type: "module",
    deno: {
      permissions: {
        net: "inherit",
        read: false,
        env: false,
      },
    },
  }).postMessage(networkSettings);
}

function setupBot(botSettings) {
  new Worker(new URL("./src/bot.js", import.meta.url).href, {
    type: "module",
  }).postMessage(botSettings);
}

const settings = await loadSettings("./settings.json");

logger.info("Starting up bot.");
setupBot({
  discordToken: Deno.env.get("DISCORD_TOKEN"),
  botSettings: settings.botSettings,
});

logger.info("Setting up network watchers.");

settings.networks.forEach((element) => {
  logger.info("Setting up " + element.name + " watcher.");
  setupWatcher({
    ...element,
    priceConversionApi: {
      url: settings.priceConversionApi.url,
      token: Deno.env.get("COINMARKETCAP_KEY"),
    },
    webhookUrl: Deno.env.get("DISCORD_WEBHOOK_URL"),
    webhookTemplate: settings.webhookTemplate,
  });
});

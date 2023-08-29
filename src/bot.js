import Logger from "https://deno.land/x/logger@v1.1.2/logger.ts";
import { fixGatewayWebsocket } from "https://x.nest.land/katsura@1.3.9/src/discordenoFixes/gatewaySocket.ts";
import { createBot } from "npm:@discordeno/bot@19.0.0-next.1e8edb9";

const logger = new Logger();

const logPrefix = "[Discord bot] ";

self.onmessage = async (event) => {
  const bot = createBot({
    token: event.data.discordToken,
    events: {
      ready: (data) =>
        logger.info(`${logPrefix}Shard ${data.shardId} is ready.`),
    },
  });

  fixGatewayWebsocket(bot.gateway);

  await bot.start();
};

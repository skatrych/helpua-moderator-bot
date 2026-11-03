import { Global, Module } from '@nestjs/common';
import { BotProvider } from './bot-provider';

@Global()
@Module({
  providers: [BotProvider],
  exports: [BotProvider],
})
export class BotProviderModule {}

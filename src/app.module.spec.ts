/**
 * Wiring tests.
 *
 * These assert the Nest dependency graph that the runtime snapshot encodes, by
 * reading the decorator metadata the compiler emitted. No module is
 * instantiated, so the Telegram client and the Prisma connection pool are never
 * constructed.
 */
import 'reflect-metadata';

import { AppModule } from './app.module';
import { AppService } from './app.service';
import { SilentTimeService } from './silent-time/silent-time.service';
import { BotProvider } from './bot-provider/bot-provider';
import { BotProviderModule } from './bot-provider/bot-provider.module';
import { UserConsentModule } from './user-consent/user-consent.module';
import { ConsentService } from './user-consent/consent.service';
import { DatabaseProviderModule } from './database-provider/database-provider.module';
import { PrismaService } from './database-provider/prisma.service';
import { ConsentPersistencyService } from './database-provider/consent/consent-persistency.service';
import { AnnouncementModule } from './announcement/announcement.module';
import { AnnouncementService } from './announcement/announcement.service';

const meta = (key: string, target: unknown): any =>
  Reflect.getMetadata(key, target) ?? [];

describe('Nest module wiring', () => {
  it('AppModule imports the feature modules and ConfigModule', () => {
    const imports = meta('imports', AppModule);

    expect(imports).toEqual(
      expect.arrayContaining([
        BotProviderModule,
        DatabaseProviderModule,
        UserConsentModule,
        AnnouncementModule,
      ]),
    );
  });

  it('AppModule provides the two root services', () => {
    expect(meta('providers', AppModule)).toEqual(
      expect.arrayContaining([AppService, SilentTimeService]),
    );
  });

  it('AppService injects BotProvider, SilentTimeService and ConsentService', () => {
    const paramTypes: any[] = Reflect.getMetadata(
      'design:paramtypes',
      AppService,
    );

    expect(paramTypes).toEqual([
      BotProvider,
      SilentTimeService,
      ConsentService,
    ]);
  });

  it('exposes BotProvider globally, because every feature needs the transport', () => {
    expect(meta('providers', BotProviderModule)).toEqual([BotProvider]);
    expect(meta('exports', BotProviderModule)).toEqual([BotProvider]);
    // Nest stores @Global() under the `__module:global__` key.
    expect(Reflect.getMetadata('__module:global__', BotProviderModule)).toBe(
      true,
    );
  });

  it('binds the CONSENT_PERSISTENCY token to the Prisma-backed implementation', () => {
    const providers = meta('providers', DatabaseProviderModule);
    const binding = providers.find(
      (p: any) => p && p.provide === 'CONSENT_PERSISTENCY',
    );

    expect(binding).toBeDefined();
    expect(binding.useClass).toBe(ConsentPersistencyService);
    expect(ConsentPersistencyService.prototype).toBeInstanceOf(Object);
    expect(meta('exports', DatabaseProviderModule)).toEqual([
      'CONSENT_PERSISTENCY',
    ]);
  });

  it('ConsentService asks for the CONSENT_PERSISTENCY token by name', () => {
    // The parameter type is erased to `Object` (the token has no class), so the
    // container can only resolve it from the explicit @Inject() token.
    expect(Reflect.getMetadata('design:paramtypes', ConsentService)).toEqual([
      Object,
    ]);
    expect(Reflect.getMetadata('self:paramtypes', ConsentService)).toEqual([
      { index: 0, param: 'CONSENT_PERSISTENCY' },
    ]);
  });

  it('UserConsentModule re-exports ConsentService to the rest of the app', () => {
    expect(meta('imports', UserConsentModule)).toContain(
      DatabaseProviderModule,
    );
    expect(meta('exports', UserConsentModule)).toEqual([ConsentService]);
  });

  it('AnnouncementModule pulls in ConfigModule and ScheduleModule', () => {
    const imports = meta('imports', AnnouncementModule);

    expect(imports).toHaveLength(2);
    expect(imports.map((m: any) => m.module)).toEqual([
      expect.any(Function),
      expect.any(Function),
    ]);
    expect(meta('providers', AnnouncementModule)).toEqual([
      AnnouncementService,
    ]);
  });

  it('AnnouncementService depends on config, the scheduler registry and the bot', () => {
    const paramTypes: any[] = Reflect.getMetadata(
      'design:paramtypes',
      AnnouncementService,
    );

    expect(paramTypes.map((t) => t && t.name)).toEqual([
      'ConfigService',
      'SchedulerRegistry',
      'BotProvider',
    ]);
  });

  it('PrismaService implements the Nest lifecycle hooks used to open/close the pool', () => {
    expect(typeof PrismaService.prototype.onModuleInit).toBe('function');
    expect(typeof PrismaService.prototype.onModuleDestroy).toBe('function');
  });
});

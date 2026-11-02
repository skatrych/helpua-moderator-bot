import { ConsentPersistencyService } from './consent-persistency.service';
import { PrismaService } from '../prisma.service';

/**
 * Isolated tests: Prisma is replaced by a spy object, so no database
 * connection is opened and no schema is required.
 */
describe('ConsentPersistencyService', () => {
  let prisma: {
    userConsent: { upsert: jest.Mock; findUnique: jest.Mock };
  };
  let svc: ConsentPersistencyService;

  beforeEach(() => {
    prisma = {
      userConsent: {
        upsert: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    svc = new ConsentPersistencyService(prisma as unknown as PrismaService);
  });

  it('upserts by userId, so a second answer overwrites the first', async () => {
    await svc.saveUserConsent(7, true);
    expect(prisma.userConsent.upsert).toHaveBeenCalledWith({
      where: { userId: 7 },
      update: { consent: true },
      create: { userId: 7, consent: true },
    });

    await svc.saveUserConsent(7, false);
    expect(prisma.userConsent.upsert).toHaveBeenLastCalledWith({
      where: { userId: 7 },
      update: { consent: false },
      create: { userId: 7, consent: false },
    });
    expect(prisma.userConsent.upsert).toHaveBeenCalledTimes(2);
  });

  it('reads consent by userId', async () => {
    prisma.userConsent.findUnique.mockResolvedValue({
      userId: 7,
      consent: true,
    });

    await expect(svc.getUserConsent(7)).resolves.toBe(true);
    expect(prisma.userConsent.findUnique).toHaveBeenCalledWith({
      where: { userId: 7 },
    });
  });

  it('defaults to false for an unknown user (fail closed)', async () => {
    prisma.userConsent.findUnique.mockResolvedValue(null);

    await expect(svc.getUserConsent(999)).resolves.toBe(false);
  });

  it('returns an explicit false that was stored as such', async () => {
    prisma.userConsent.findUnique.mockResolvedValue({
      userId: 8,
      consent: false,
    });

    await expect(svc.getUserConsent(8)).resolves.toBe(false);
  });

  it('propagates database errors to the caller', async () => {
    prisma.userConsent.findUnique.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(svc.getUserConsent(7)).rejects.toThrow('ECONNREFUSED');
  });
});

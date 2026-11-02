export interface ConsentPersistency {
  saveUserConsent(userId: number, consent: boolean): Promise<void>;
  getUserConsent(userId: number): Promise<boolean | null>;
}

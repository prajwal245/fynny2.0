/** A firm that is probably a test or fake sign-up. Only a hint for the admin: nothing is changed by it. */
const NAME = /\b(test|testing|demo|dummy|sample|asdf|qwerty|xyz|fake|trial run|my practice)\b/i;
const MAIL = /(^|[._+-])(test|testing|demo|dummy|fake|asdf|qa)(\d*)(@|[._+-])|@(example\.(com|org|in)|test\.com|mailinator\.com|yopmail\.com|tempmail\.[a-z]+|guerrillamail\.com)$|@fynhelp\.com$/i;

export function looksLikeTest(name: string | null | undefined, email: string | null | undefined): boolean {
  return Boolean((name && NAME.test(name)) || (email && MAIL.test(email.trim())));
}

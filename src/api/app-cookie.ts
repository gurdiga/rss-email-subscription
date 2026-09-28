export const sessionCookieMaxAge = 48 * 3600 * 1000;

// express-session's own default, made explicit so terminal-logout handlers can
// reference it (via clearSessionCookie below) to expire the cookie on the client
// without duplicating the string. Defined here rather than in session.ts so this
// stays a leaf module: session.ts already imports init-app, and app-cookie.ts is
// imported from enough places that routing it back through session.ts would risk
// a require() cycle where this constant is still undefined when first read.
export const sessionCookieName = 'connect.sid';

export interface AppCookie {
  name: string;
  value: string | null;
  options?: AppCookieOptions;
}

// See https://expressjs.com/en/api.html#res.cookie
interface AppCookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  isRolling?: boolean;
}

export const navbarCookieName = 'displayPrivateNavbar';
const navbarCookieOptions: AppCookieOptions = {
  httpOnly: false,
  maxAge: sessionCookieMaxAge,
  isRolling: true,
};

export const enablePrivateNavbarCookie: AppCookie = {
  name: navbarCookieName,
  value: 'true',
  options: navbarCookieOptions,
};

export const disablePrivateNavbarCookie: AppCookie = {
  ...enablePrivateNavbarCookie,
  value: 'false',
};

export const demoCookieName = 'isDemo';
const demoCookieOptions: AppCookieOptions = {
  httpOnly: false,
  maxAge: sessionCookieMaxAge,
  isRolling: true,
};

export const setDemoCookie: AppCookie = {
  name: demoCookieName,
  value: 'true',
  options: demoCookieOptions,
};

export const unsetDemoCookie: AppCookie = {
  ...setDemoCookie,
  value: 'false',
};

export const appCookies: AppCookie[] = [enablePrivateNavbarCookie, setDemoCookie];

// destroy()ing the session record doesn't itself tell the browser to stop sending
// the cookie, so a terminal logout has to expire it explicitly — otherwise every
// later request keeps presenting a cookie the store no longer has a file for,
// paying session-file-store's five-retry ENOENT cost each time. maxAge: 0
// expires it immediately, the same as Express's own res.clearCookie.
export const clearSessionCookie: AppCookie = {
  name: sessionCookieName,
  value: '',
  options: { maxAge: 0 },
};

export const sessionCookieMaxAge = 48 * 3600 * 1000;

export interface AppCookie {
  name: string;
  value: string | null;
  options?: AppCookieOptions;
}

// See https://expressjs.com/en/api.html#res.cookie
interface AppCookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
}

export const navbarCookieName = 'displayPrivateNavbar';
const navbarCookieOptions: AppCookieOptions = {
  httpOnly: false,
  maxAge: sessionCookieMaxAge,
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

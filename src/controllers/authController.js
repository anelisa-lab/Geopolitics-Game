import { authService } from '../services/AuthService.js';
import { signupSchema, loginSchema } from '../validators/authSchemas.js';
import { ValidationError } from '../domain/errors.js';

const firstError = (result) => result.error.issues[0].message;

// A fresh session ID on every login protects against "session fixation" attacks
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = user;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

export function showSignup(req, res) {
  res.render('auth/signup', { title: 'Sign up', error: null, values: {} });
}

export function showLogin(req, res) {
  res.render('auth/login', { title: 'Log in', error: null, values: {} });
}

export async function signup(req, res, next) {
  const values = { username: req.body.username, email: req.body.email };
  const result = signupSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).render('auth/signup', { title: 'Sign up', error: firstError(result), values });
  }
  try {
    const user = await authService.signup(result.data);
    await startSession(req, user);
    res.redirect('/');
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).render('auth/signup', { title: 'Sign up', error: err.message, values });
    }
    next(err);
  }
}

export async function login(req, res, next) {
  const values = { username: req.body.username };
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).render('auth/login', { title: 'Log in', error: firstError(result), values });
  }
  try {
    const user = await authService.login(result.data);
    await startSession(req, user);
    res.redirect('/');
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).render('auth/login', { title: 'Log in', error: err.message, values });
    }
    next(err);
  }
}

export function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    res.redirect('/');
  });
}
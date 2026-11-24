import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {Passport} from 'passport';
import {Strategy as LocalStrategy} from 'passport-local';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import {HttpError} from './errors.js';

const derive = promisify(scrypt);
const scryptOptions = {N:131072,r:8,p:1,maxmem:192 * 1024 * 1024};
const dummyHash = 'scrypt-v1:' + '0'.repeat(32) + ':' + '0'.repeat(64);
const sessionName = 'sparkle_admin';
const PgStore = connectPgSimple(session);
const validHash = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{64})$/;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const digest = await derive(password,salt,32,scryptOptions);
  return 'scrypt-v1:' + salt.toString('hex') + ':' + digest.toString('hex');
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length < 1 || Buffer.byteLength(password) > 256) return false;
  const match = validHash.exec(stored || '') || validHash.exec(dummyHash);
  const actual = await derive(password,Buffer.from(match[1],'hex'),32,scryptOptions);
  return timingSafeEqual(actual,Buffer.from(match[2],'hex')) && Boolean(stored && validHash.test(stored));
}

export function adminAuthentication({env,pool,db,store}) {
  const passport = new Passport();
  const cookie = {httpOnly:true,secure:env.NODE_ENV === 'production',sameSite:'strict',path:'/api/admin'};
  const sessionStore = store || (pool && new PgStore({pool,tableName:'admin_sessions',pruneSessionInterval:60 * 60,
    errorLog:() => console.error('Unable to maintain admin sessions.')}));
  const middleware = sessionStore ? session({
    name:sessionName,secret:env.SESSION_SECRET,store:sessionStore,resave:false,saveUninitialized:false,
    cookie:{...cookie,maxAge:60 * 60 * 1000}
  }) : (req,res,next) => next(new HttpError(503,'store_unconfigured'));
  let hashing = false;
  passport.use(new LocalStrategy({usernameField:'email'},async (email,password,done) => {
    if (hashing) return done(new HttpError(429,'too_many_requests'));
    hashing = true;
    try {
      const user = await db.adminByEmail(email.trim().toLowerCase());
      const matches = await verifyPassword(password,user?.password_hash);
      return done(null,matches && user ? {user_id:user.user_id} : false);
    } catch (error) { return done(error); }
    finally { hashing = false; }
  }));
  passport.serializeUser((user,done) => done(null,user.user_id));
  passport.deserializeUser(async (id,done) => {
    try { done(null,(await db.activeAdmin(id)) || false); }
    catch (error) { done(error); }
  });

  return {
    middleware:[middleware,passport.initialize(),passport.session()],
    login(req,res,next) {
      passport.authenticate('local',(error,user) => {
        if (error) return next(error);
        if (!user) return next(new HttpError(401,'invalid_credentials'));
        req.logIn(user, err => err ? next(err) : res.json({ok:true}));
      })(req,res,next);
    },
    logout(req,res,next) {
      req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie(sessionName,cookie).json({ok:true});
      });
    }
  };
}

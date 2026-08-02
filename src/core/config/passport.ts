import passport from 'passport';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import { Strategy as FacebookStrategy } from 'passport-facebook';

import { User } from '../../modules/auth/models/user.model';
import { env } from './env';

/* -------------------------------------------------------------------------- */
/*                               LOCAL STRATEGY                               */
/* -------------------------------------------------------------------------- */

passport.use(
  'local',
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
      session: false,
    },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email });

        if (!user || !user.passwordHash) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        user.lastLoginAt = new Date();
        await user.save();

        return done(null, user as any);
      } catch (err) {
        return done(err);
      }
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                                JWT STRATEGY                                */
/* -------------------------------------------------------------------------- */

passport.use(
  'jwt',
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        // Refresh tokens must never authenticate as access tokens
        if (payload.type === 'refresh') return done(null, false);

        const user = await User.findById(payload.sub);
        if (!user) return done(null, false);

        return done(null, user as any);
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                              GOOGLE OAUTH                                  */
/* -------------------------------------------------------------------------- */

passport.use(
  'google',
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${env.BACKEND_URL}/api/auth/oauth/google/callback`,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const provider = 'google';
        const providerUserId = profile.id;

        let user = await User.findOne({
          oauthProviders: { $elemMatch: { provider, providerUserId } },
        });

        if (!user) {
          user = await User.create({
            email: profile.emails?.[0]?.value,
            role: 'TENANT',
            status: 'ACTIVE',
            oauthProviders: [{ provider, providerUserId }],
            profile: {
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
            },
          });
        }

        user.lastLoginAt = new Date();
        await user.save();

        return done(null, user as any);
      } catch (err) {
        return done(err);
      }
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                             LINKEDIN OAUTH                                 */
/* -------------------------------------------------------------------------- */

passport.use(
  'linkedin',
  new LinkedInStrategy(
    {
      clientID: env.LINKEDIN_CLIENT_ID!,
      clientSecret: env.LINKEDIN_CLIENT_SECRET!,
      callbackURL: `${env.BACKEND_URL}/api/auth/oauth/linkedin/callback`,
      scope: ['r_emailaddress', 'r_liteprofile'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const provider = 'linkedin';
        const providerUserId = profile.id;

        let user = await User.findOne({
          oauthProviders: { $elemMatch: { provider, providerUserId } },
        });

        if (!user) {
          user = await User.create({   
            email: profile.emails?.[0]?.value,  
            role: 'INVESTOR',
            status: 'ACTIVE',
            oauthProviders: [{ provider, providerUserId }],
            profile: {
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
            },
          });
        }

        user.lastLoginAt = new Date();
        await user.save();

        return done(null, user as any);
      } catch (err) {
        return done(err);
      }
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                             FACEBOOK OAUTH                                 */
/* -------------------------------------------------------------------------- */

passport.use(
  'facebook',
  new FacebookStrategy(
    {
      clientID: env.FACEBOOK_CLIENT_ID!,
      clientSecret: env.FACEBOOK_CLIENT_SECRET!,
      callbackURL: `${env.BACKEND_URL}/api/auth/oauth/facebook/callback`,
      profileFields: ['id', 'emails', 'name'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const provider = 'facebook';
        const providerUserId = profile.id;

        let user = await User.findOne({
          oauthProviders: { $elemMatch: { provider, providerUserId } },
        });

        if (!user) {
          user = await User.create({
            email: profile.emails?.[0]?.value,
            role: 'TENANT',
            status: 'ACTIVE',
            oauthProviders: [{ provider, providerUserId }],
            profile: {
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
            },
          });
        }

        user.lastLoginAt = new Date();
        await user.save();

        return done(null, user as any);
      } catch (err) {
        return done(err);
      }
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                             JWT GENERATOR                                  */
/* -------------------------------------------------------------------------- */

export const generateJwt = (user: any, orgId?: string | null) => {
  const payload: Record<string, unknown> = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  };
  if (orgId != null) payload.orgId = orgId;
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
};

// Long-lived refresh token. The `type: 'refresh'` claim keeps it unusable as an
// access token (authMiddleware rejects it) — it is only accepted by /api/auth/refresh.
export const generateRefreshJwt = (user: any) => {
  const payload: Record<string, unknown> = {
    sub: user._id.toString(),
    type: 'refresh',
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' });
};

export default passport;

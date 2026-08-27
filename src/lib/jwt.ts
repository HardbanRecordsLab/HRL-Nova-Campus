import jwt from "jsonwebtoken";

type LaunchTokenPayload = {
  sub: string;
  courseId: string;
  enrollmentId: string;
  domain: string;
  jti: string;
};

export function signLaunchToken(
  payload: LaunchTokenPayload,
  secret: string,
  expiresIn = "5m"
) {
  return jwt.sign(payload, secret, {
    issuer: process.env.JWT_ISSUER,
    audience: payload.domain,
    expiresIn: expiresIn as any,
  });
}

export function verifyLaunchToken(token: string, secret: string) {
  return jwt.verify(token, secret, {
    issuer: process.env.JWT_ISSUER,
  });
}

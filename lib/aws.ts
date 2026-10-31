/**
 * Shared config for AWS SDK clients (SNS, Bedrock).
 *
 * On Cloudflare Workers the SDK resolves to its browser build, which has no
 * default credential chain: it never reads AWS_ACCESS_KEY_ID from the
 * environment and every call fails with "Credential is missing". So when keys
 * are set, hand them over explicitly. When they aren't (the Node/Docker image
 * on an IAM role), leave `credentials` out and the SDK's normal chain applies.
 */
export function awsClientConfig() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } = process.env;
  return {
    region: process.env.AWS_REGION ?? "ap-southeast-2",
    ...(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
            sessionToken: AWS_SESSION_TOKEN || undefined,
          },
        }
      : {}),
  };
}

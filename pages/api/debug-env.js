export default function handler(req, res) {
  res.status(200).json({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "present" : "missing",
    NODE_ENV: process.env.NODE_ENV || null,
    VERCEL_ENV: process.env.VERCEL_ENV || null,
  });
}

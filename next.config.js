/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // verhindert, dass pdfkit versehentlich clientseitig gebundled wird
    config.externals = config.externals || [];
    config.externals.push("pdfkit");
    return config;
  },
};
module.exports = nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // TableCheck CSV取込(数百〜数千行)がデフォルトの1MB上限に収まらない場合があるため拡大
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;

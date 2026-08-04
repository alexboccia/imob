import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      papel?: string;
    } & DefaultSession["user"];
  }

  interface User {
    papel?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    papel?: string;
  }
}

import { Providers } from "../../providers";

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}

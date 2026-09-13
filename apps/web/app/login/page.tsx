import LoginForm from "@/components/login/LoginForm";

export default function LoginPage() {
  const demoEnabled = process.env.ALLOW_DEMO_ACCESS === "true";
  return <LoginForm demoEnabled={demoEnabled} />;
}
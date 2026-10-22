import BankAcsSimulator from '@/components/BankAcsSimulator';

export default function BankGatewaySessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  return <BankAcsSimulator initialSessionId={params.sessionId} />;
}

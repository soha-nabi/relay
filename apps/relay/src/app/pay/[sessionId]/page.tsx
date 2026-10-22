import CustomerHostedCheckout from '@/components/CustomerHostedCheckout';

export default function PaySessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  return <CustomerHostedCheckout initialSessionId={params.sessionId} />;
}

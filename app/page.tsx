/* oxlint-disable nextjs/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */
import { headers } from 'next/headers';
import Workspace from './workspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const request = await headers();
  if (request.get('oai-authenticated-user-id')) return <Workspace />;
  return (
    <main>
      <section className="setup">
        <p className="eyebrow">TRACTION OS · PUBLIC BETA</p>
        <h1>A growth workspace that remembers.</h1>
        <p className="muted intro">
          Research your business, confirm what matters, and turn experiments
          into your next move. Your business records stay private to your
          account.
        </p>
        <a
          className="signin-button"
          href="/signin-with-chatgpt?return_to=%2F"
          target="_top"
        >
          Sign in with ChatGPT
        </a>
        <p className="small muted">
          AI runs share a limited founder-funded trial budget. When it runs out,
          saved work remains available.
        </p>
      </section>
    </main>
  );
}

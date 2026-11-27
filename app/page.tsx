import BeaverScene from './BeaverScene';

export default function Home() {
  return (
    <main className="page">
      <span className="badge">Coming soon</span>
      <h1>Something strong is being built.</h1>
      <p className="lead">
        Like the beaver, Canada&apos;s national animal, we&apos;re building our new website one log at
        a time. Check back soon.
      </p>

      <BeaverScene />

      <footer>© {new Date().getFullYear()} BBFF</footer>
    </main>
  );
}

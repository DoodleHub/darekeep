import { App } from "@/components/App";

// Every path (/, /d/:id, /c/:code, /build/:id, …) renders the same client app,
// which owns routing so the game loop and audio survive navigation.
export default function Page() {
  return <App />;
}

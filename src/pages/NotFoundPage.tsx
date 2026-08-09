import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="not-found">
      <div className="state-icon"><Compass size={28} /></div>
      <span>404</span><h1>This route isn't on the map</h1>
      <p>The page may have moved, or the address may be incorrect.</p>
      <Link className="button primary" to="/"><ArrowLeft size={16} /> Back to overview</Link>
    </div>
  );
}

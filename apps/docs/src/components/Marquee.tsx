import { ADAPTERS } from '../data/adapters';
import { DriverIcon } from './Icon';

export default function Marquee() {
  // Triple the list so the CSS marquee animation loops seamlessly.
  // Section index distinguishes the three copies; adapter key
  // distinguishes within a section.
  const items = [0, 1, 2].flatMap((section) =>
    ADAPTERS.map((a) => ({ ...a, slot: `${section}-${a.key}` }))
  );
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {items.map((a) => (
          <span className="marquee-item" key={a.slot}>
            <DriverIcon />
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PolicySection } from '@/types/store';
import { cn } from '@/lib/utils';

export default function PolicyAccordion({ section }: { section: PolicySection }) {
  const [open, setOpen] = useState(true);

  return (
    <article className={cn('policy-card', open && 'policy-card--open')}>
      <button type="button" className="policy-card__head" onClick={() => setOpen((prev) => !prev)}>
        <div>
          <h3>{section.title}</h3>
          <p>{section.description}</p>
        </div>
        <ChevronDown size={18} className={cn(open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="policy-card__body">
          {section.subsections.map((sub) => (
            <div className="policy-card__section" key={sub.heading}>
              <h4>{sub.heading}</h4>
              {sub.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {sub.points ? (
                <ul>
                  {sub.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

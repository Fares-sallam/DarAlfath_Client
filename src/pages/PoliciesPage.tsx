import PolicyAccordion from '@/components/PolicyAccordion';
import { OrnamentDivider } from '@/components/Ornament';
import { policySections } from '@/data/policies';

export default function PoliciesPage() {
  return (
    <div className="page-sections">
      <section className="story-hero story-hero--compact">
        <div>
          <span className="page-kicker">سياستنا</span>
          <h1>سياسات واضحة وتجربة موثوقة</h1>
          <p>كل ما تحتاج إلى معرفته عن الشحن، الإرجاع، الخصوصية، والشروط.</p>
          <OrnamentDivider />
        </div>
      </section>

      <section className="policies-layout">
        <aside className="policy-side">
          <a href="#shipping">سياسة الشحن</a>
          <a href="#returns">سياسة الإرجاع</a>
          <a href="#privacy">سياسة الخصوصية</a>
          <a href="#terms">الشروط والأحكام</a>
        </aside>

        <div className="policies-stack">
          {policySections.map((section) => <div id={section.id} key={section.id}><PolicyAccordion section={section} /></div>)}
        </div>
      </section>
    </div>
  );
}

import { OrnamentDivider } from '@/components/Ornament';

export default function AboutPage() {
  return (
    <div className="page-sections">
      <section className="story-hero">
        <div>
          <span className="page-kicker">عنّا</span>
          <h1>دار الفتح للنشر والتوزيع</h1>
          <p>دار نشر عربية تهدف إلى تقديم محتوى أصيل، رصين، وقريب من القارئ، مع عناية خاصة بجمال العرض، واحترام المعرفة، وسهولة الوصول إلى الإصدارات.</p>
          <OrnamentDivider />
        </div>
      </section>

      <section className="story-grid">
        <article className="story-card"><h3>رؤيتنا</h3><p>أن نكون وجهة عربية موثوقة تجمع بين أصالة المحتوى وحداثة التجربة.</p></article>
        <article className="story-card"><h3>رسالتنا</h3><p>تقديم الكتب الورقية والرقمية في واجهة هادئة، أنيقة، وسهلة الاستخدام.</p></article>
        <article className="story-card"><h3>قيمنا</h3><p>الجودة، الجمال، احترام القارئ، والالتزام بالمعرفة الهادفة.</p></article>
      </section>

      <section className="page-card">
        <div className="timeline">
          <div className="timeline__item"><b>البداية</b><span>فكرة لنشر المعرفة الهادفة بأسلوب عربي أنيق.</span></div>
          <div className="timeline__item"><b>التوسع</b><span>إصدارات متنوعة في الأدب، الثقافة، والتزكية.</span></div>
          <div className="timeline__item"><b>التطوير</b><span>منصة رقمية حديثة تربط القارئ مباشرة بإصدارات الدار.</span></div>
        </div>
      </section>
    </div>
  );
}

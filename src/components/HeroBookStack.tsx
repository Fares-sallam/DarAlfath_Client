export default function HeroBookStack() {
  return (
    <div className="hero-stack">
      <div className="hero-stack__glow" />
      <div className="hero-stack__card hero-stack__card--back" />
      <div className="hero-stack__card hero-stack__card--middle" />
      <div className="hero-stack__card hero-stack__card--front">
        <div className="hero-stack__cover">
          <img src="/branding/dar-alfath-logo.jpeg" alt="دار الفتح" />
        </div>
      </div>
    </div>
  );
}

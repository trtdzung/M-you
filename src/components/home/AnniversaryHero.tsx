export function AnniversaryHero() {
  return (
    <div className="login-anniversary" aria-label="MSB · Vươn tầm từ di sản · 35 năm">
      <svg viewBox="0 0 400 270" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {[ [45, 90, 32], [180, 30, 20], [300, 65, 17], [350, 180, 16] ].map(([x, y, radius], index) => (
          <g key={index} stroke="#ffd278" opacity="0.5">
            {Array.from({ length: 16 }, (_, ray) => <line key={ray} x1={x} y1={y - 5} x2={x} y2={y - radius} transform={`rotate(${ray * 22.5} ${x} ${y})`} />)}
          </g>
        ))}
        <g fill="#ffb24d" opacity="0.22">
          {Array.from({ length: 18 }, (_, i) => <rect key={i} x={i * 24 - 4} y={205 - (i * 37 % 65)} width={19} height={100} />)}
        </g>
      </svg>
      <span className="login-heritage">VƯƠN TẦM<br /><small>TỪ</small> DI SẢN</span>
      <span className="login-years">35</span>
      <span className="login-year-label">NĂM</span>
    </div>
  );
}


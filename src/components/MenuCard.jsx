import "./MenuCard.css";

export default function MenuCard({ item, onViewAR }) {
  const hasModel = Boolean(item.glbUrl);

  return (
    <div className="menu-card">
      <div className="menu-card-preview">
        {item.imageUrl && (
          <img
            className="menu-card-image"
            src={item.imageUrl}
            alt={item.name}
          />
        )}
        <div className="menu-card-3d-badge">3D</div>
      </div>
      <div className="menu-card-body">
        <div className="menu-card-top">
          <h3 className="menu-card-name">{item.name}</h3>
          <span className="menu-card-price">${item.price.toFixed(2)}</span>
        </div>
        <p className="menu-card-desc">{item.description}</p>
        <span className="menu-card-category">{item.category}</span>
        {hasModel && (
          <button className="menu-card-ar-btn" onClick={() => onViewAR(item)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            View in AR
          </button>
        )}
      </div>
    </div>
  );
}

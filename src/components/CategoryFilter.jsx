import "./CategoryFilter.css";

export default function CategoryFilter({ categories, active, onChange }) {
  return (
    <div className="category-filter">
      <button
        className={`category-btn ${active === "All" ? "active" : ""}`}
        onClick={() => onChange("All")}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          className={`category-btn ${active === cat ? "active" : ""}`}
          onClick={() => onChange(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

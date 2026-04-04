import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import MenuCard from "./components/MenuCard";
import CategoryFilter from "./components/CategoryFilter";
import menuItems from "./data/menuItems";

const ARViewer = lazy(() => import("./components/ARViewer"));
import "./App.css";

export default function App() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [arItem, setArItem] = useState(null);

  const categories = useMemo(
    () => [...new Set(menuItems.map((item) => item.category))],
    []
  );

  const filteredItems = useMemo(
    () =>
      activeCategory === "All"
        ? menuItems
        : menuItems.filter((item) => item.category === activeCategory),
    [activeCategory]
  );

  const handleViewAR = useCallback((item) => {
    setArItem(item);
  }, []);

  const handleCloseAR = useCallback(() => {
    setArItem(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Menu</h1>
        <p className="app-subtitle">Tap "View in AR" to see dishes on your table</p>
      </header>

      <main className="app-main">
        <CategoryFilter
          categories={categories}
          active={activeCategory}
          onChange={setActiveCategory}
        />

        <div className="menu-grid">
          {filteredItems.map((item) => (
            <MenuCard key={item.id} item={item} onViewAR={handleViewAR} />
          ))}
        </div>

        {filteredItems.length === 0 && (
          <p className="empty-state">No items in this category.</p>
        )}
      </main>

      {arItem && (
        <Suspense fallback={null}>
          <ARViewer item={arItem} onClose={handleCloseAR} />
        </Suspense>
      )}
    </div>
  );
}

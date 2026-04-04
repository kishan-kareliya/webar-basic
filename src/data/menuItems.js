/**
 * Static menu data — replace with API calls when integrating with your POS backend.
 *
 * Place .glb files in public/models/ and reference as "/models/filename.glb"
 *
 * arScale (optional): Override auto-scaling for this item.
 *   - null/undefined → auto-normalize to ~30cm (default, works for any .glb)
 *   - number → target size in meters (e.g. 0.15 for a small coffee cup, 0.5 for a large pizza)
 */
const menuItems = [
  {
    id: 1,
    name: "Classic Burger",
    description: "Juicy beef patty with fresh lettuce, tomato, and special sauce",
    price: 12.99,
    category: "Main Course",
    glbUrl: "/models/burger.glb",
    arScale: null,
  },
  {
    id: 2,
    name: "Margherita Pizza",
    description: "Wood-fired pizza with fresh mozzarella, basil, and tomato sauce",
    price: 14.99,
    category: "Main Course",
    glbUrl: "/models/pizza.glb",
    arScale: 0.4,
  },
  {
    id: 3,
    name: "Caesar Salad",
    description: "Crisp romaine lettuce with parmesan, croutons, and caesar dressing",
    price: 9.99,
    category: "Starters",
    glbUrl: "/models/salad.glb",
    arScale: null,
  },
  {
    id: 4,
    name: "Chocolate Cake",
    description: "Rich chocolate layer cake with ganache frosting",
    price: 7.99,
    category: "Desserts",
    glbUrl: "/models/cake.glb",
    arScale: 0.2,
  },
  {
    id: 5,
    name: "Iced Coffee",
    description: "Cold brew coffee served over ice with cream",
    price: 4.99,
    category: "Beverages",
    glbUrl: "/models/coffee.glb",
    arScale: 0.25,
  },
  {
    id: 6,
    name: "French Fries",
    description: "Crispy golden fries with seasoning salt",
    price: 5.99,
    category: "Starters",
    glbUrl: "/models/fries.glb",
    arScale: null,
  },
];

export default menuItems;

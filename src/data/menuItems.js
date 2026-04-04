/**
 * Static menu data — replace with API calls when integrating with your POS backend.
 * Each item needs a `glbUrl` pointing to the .glb model file.
 *
 * Place your .glb files in public/models/ and reference them as "/models/filename.glb"
 */
const menuItems = [
  {
    id: 1,
    name: "Classic Burger",
    description: "Juicy beef patty with fresh lettuce, tomato, and special sauce",
    price: 12.99,
    category: "Main Course",
    glbUrl: "/models/burger.glb",
    image: null,
  },
  {
    id: 2,
    name: "Margherita Pizza",
    description: "Wood-fired pizza with fresh mozzarella, basil, and tomato sauce",
    price: 14.99,
    category: "Main Course",
    glbUrl: "/models/pizza.glb",
    image: null,
  },
  {
    id: 3,
    name: "Caesar Salad",
    description: "Crisp romaine lettuce with parmesan, croutons, and caesar dressing",
    price: 9.99,
    category: "Starters",
    glbUrl: "/models/salad.glb",
    image: null,
  },
  {
    id: 4,
    name: "Chocolate Cake",
    description: "Rich chocolate layer cake with ganache frosting",
    price: 7.99,
    category: "Desserts",
    glbUrl: "/models/cake.glb",
    image: null,
  },
  {
    id: 5,
    name: "Iced Coffee",
    description: "Cold brew coffee served over ice with cream",
    price: 4.99,
    category: "Beverages",
    glbUrl: "/models/coffee.glb",
    image: null,
  },
  {
    id: 6,
    name: "French Fries",
    description: "Crispy golden fries with seasoning salt",
    price: 5.99,
    category: "Starters",
    glbUrl: "/models/fries.glb",
    image: null,
  },
];

export default menuItems;

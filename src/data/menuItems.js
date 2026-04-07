/**
 * Static menu data — replace with API calls when integrating with your POS backend.
 *
 * Place .glb files in public/models/ and images in public/images/
 *
 * arScale = real-world largest dimension of the plate/dish in meters.
 * Measure the actual plate edge-to-edge at the restaurant with a tape.
 * This controls how big the food appears on the table in AR.
 *
 * TODO: Replace all arScale values with real measurements.
 * Current values are rough estimates — measure actual plates.
 */
const menuItems = [
  {
    id: 1,
    name: "Classic Burger",
    description: "Juicy beef patty with fresh lettuce, tomato, and special sauce",
    price: 12.99,
    category: "Main Course",
    glbUrl: "/models/burger.glb",
    imageUrl: null,
    arScale: 0.22, // ~22cm plate, measure actual
  },
  {
    id: 2,
    name: "Margherita Pizza",
    description: "Wood-fired pizza with fresh mozzarella, basil, and tomato sauce",
    price: 14.99,
    category: "Main Course",
    glbUrl: "/models/pizza.glb",
    imageUrl: "/images/pizza.png",
    arScale: 0.35, // ~35cm board, measure actual
  },
  {
    id: 3,
    name: "Crispy Chicken Bao",
    description: "Steamed bao bun stuffed with crispy fried chicken and tangy slaw",
    price: 10.99,
    category: "Starters",
    glbUrl: "/models/Chrispy_Chicken_Bao.glb",
    imageUrl: "/images/chicken bao.png",
    arScale: 0.16, // ~16cm small plate, measure actual
  },
  {
    id: 4,
    name: "Filling Cheese Momo",
    description: "Steamed dumplings generously filled with melted cheese blend",
    price: 9.99,
    category: "Starters",
    glbUrl: "/models/Filling_cheese_momo.glb",
    imageUrl: "/images/filling-cheese-dumpling.png",
    arScale: 0.18, // ~18cm plate, measure actual
  },
  {
    id: 5,
    name: "Mushroom Chilli",
    description: "Crispy mushrooms tossed in spicy chilli sauce with peppers",
    price: 11.99,
    category: "Starters",
    glbUrl: "/models/Mushroom_Chilli.glb",
    imageUrl: null,
    arScale: 0.20, // ~20cm plate, measure actual
  },
  {
    id: 6,
    name: "Paneer Malai Tikka",
    description: "Creamy marinated paneer cubes grilled to perfection",
    price: 13.99,
    category: "Main Course",
    glbUrl: "/models/Paneer_Malai_Tikka.glb",
    imageUrl: "/images/paneer-malai-tikka.png",
    arScale: 0.24, // ~24cm plate, measure actual
  },
  {
    id: 7,
    name: "Tandoori Chaap",
    description: "Soya chaap marinated in tandoori spices and chargrilled",
    price: 12.99,
    category: "Main Course",
    glbUrl: "/models/tandoori_chaap.glb",
    imageUrl: "/images/tandoori-chaap.png",
    arScale: 0.24, // ~24cm plate, measure actual
  },
  {
    id: 8,
    name: "Veg Biryani",
    description: "Fragrant basmati rice layered with spiced vegetables and herbs",
    price: 14.99,
    category: "Main Course",
    glbUrl: "/models/vegbiryani.glb",
    imageUrl: "/images/veg-biryani.png",
    arScale: 0.26, // ~26cm bowl, measure actual
  },
  {
    id: 9,
    name: "Veg Seekh Kabab",
    description: "Spiced vegetable skewers grilled on open flame",
    price: 10.99,
    category: "Starters",
    glbUrl: "/models/veg_sikh_kabab.glb",
    imageUrl: "/images/veg-seekh-kabab.png",
    arScale: 0.22, // ~22cm plate, measure actual
  },
  {
    id: 10,
    name: "Powder",
    description: "Spiced powder",
    price: 10.99,
    category: "Starters",
    glbUrl: "/models/powder_model.glb",
    imageUrl: "/images/veg-seekh-kabab.png",
    arScale: 0.001, // ~11cm plate, measure actual
  },
];

export default menuItems;

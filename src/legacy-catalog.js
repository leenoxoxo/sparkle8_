import {organizeProducts} from './product-collections.js';

export const imageCatalog = {
  home: ['/HOME%20IMGS/hero%20img.jpeg'],
  about: { story: '/ABOUT%20US%20IMGS/about.us.jpeg', material: '/The%20material.PNG' },
  shop: {
    named: {
      'strawberry-cream-phone-case': '/SHOP%20IMGS/Strawberry%20Cream%20Case.png',
      'cherry-cream-mirror': '/SHOP%20IMGS/Cherry%20Cream%20Mirror.png',
      'soft-sea-brush': '/SHOP%20IMGS/soft%20sea%20brush.png',
      'fake-cake-box': '/CUSTOM%20ORDERS%20IMGS/barbie%20fake%20cake%20box.png'
    },
    unassigned: ['/SHOP%20IMGS/Pearl%20Bow%20Comb.jpe', '/SHOP%20IMGS/mirror%201.jpe', '/SHOP%20IMGS/mirror%202.jpe', '/SHOP%20IMGS/phonecase%201.jpe', '/SHOP%20IMGS/phonecase%203.jpe']
  },
  workshops: {
    named: {
      'japanese-cream-basics': '/WORKSHOPS%20IMGS/Japanese%20Cream%20Basics.jpeg',
      'japanese-cream-phone-case': '/WORKSHOPS%20IMGS/Decoden%20Phone%20Case.jpeg',
      'private-group-session': '/WORKSHOPS%20IMGS/Private%20Group%20Session.jpeg',
      'brush-workshop': '/WORKSHOPS%20IMGS/brush%20workshop.jpeg',
      'japanese-cream-mirror-2': '/WORKSHOPS%20IMGS/2.jpeg',
      'japanese-cream-mirror-3': '/WORKSHOPS%20IMGS/3.jpeg',
      'japanese-cream-phone-case-22': '/WORKSHOPS%20IMGS/22.jpeg',
      'japanese-cream-phone-case-33': '/WORKSHOPS%20IMGS/33.jpeg',
      'japanese-cream-phone-case-333': '/WORKSHOPS%20IMGS/333.jpeg',
      'brush-workshop-222': '/WORKSHOPS%20IMGS/222.PNG',
      'brush-workshop-333': '/WORKSHOPS%20IMGS/333.HEIC'
    },
    unassigned: ['/WORKSHOPS%20IMGS/workshop%202.jpeg', '/WORKSHOPS%20IMGS/Inside%201.jpg', '/WORKSHOPS%20IMGS/Inside%202.jpg']
  },
  customOrders: ["/CUSTOM%20ORDERS%20IMGS/sunflower%20fake%20cake%20box.png","/CUSTOM%20ORDERS%20IMGS/barbie%20fake%20cake%20box.png","/CUSTOM%20ORDERS%20IMGS/sea%20fake%20cake%20box.png","/CUSTOM%20ORDERS%20IMGS/butterfly%20fake%20cake%20box.png","/CUSTOM%20ORDERS%20IMGS/flowers%20fake%20cake%20box.png","/CUSTOM%20ORDERS%20IMGS/mermaid%20fake%20cake%20box.png","/CUSTOM%20ORDERS%20IMGS/white%20fake%20cake%20box.png","/CUSTOM%20ORDERS%20IMGS/cherry%20fake%20cake%20box.png","/CUSTOM%20ORDERS%20IMGS/hotpink%20fake%20cake%20box.png"]
};
const originalProducts = [
  { slug: 'soft-blue-pink-cream-case', addedOrder: 0, name: 'Soft Blue and Pink Cream Case', category: 'Phone Cases', status: 'Available', price: '₪39.99', description: 'Soft blue and pink fake cake 3D phone case with seashells and pearls.', tone: 'pink', icon: '📱', image: imageCatalog.shop.named['strawberry-cream-phone-case'] },
  { slug: 'marshmallow-mirror', addedOrder: 1, name: 'Marshmallow Mirror', category: 'Mirrors', status: 'Available', price: '₪45', description: 'Mirror with a marshmallow shape and bows.', tone: 'rose', icon: '🪞', image: imageCatalog.shop.named['cherry-cream-mirror'] },
  { slug: 'mini-brush', addedOrder: 11, name: 'Mini Brush', category: 'Brushes', status: 'Available', price: '₪10', originalPrice: '₪19.99', discountPercent: 50, description: 'A mini decorative brush. Browse the carousel for a closer look.', tone: 'cream', icon: '🎀', image: '/SHOP%20IMGS/mini%20brush.PNG', images: ['/SHOP%20IMGS/mini%20brush.PNG', '/SHOP%20IMGS/mini.PNG'], details: ['Message us on Instagram'] },
  { slug: 'soft-sea-brush', addedOrder: 2, name: 'Soft Sea Brush', category: 'Brushes', status: 'Available', price: '₪39.99', description: 'A hand-decorated cream brush with a soft, sea-inspired look for your everyday routine.', tone: 'lilac', icon: '🎀', image: imageCatalog.shop.named['soft-sea-brush'] },
  { slug: 'blue-star-fake-cake-box', addedOrder: 9, name: 'Blue Star Fake Cake Box', category: 'Boxes', status: 'Available', price: '₪25', originalPrice: '₪50', discountPercent: 50, description: 'A blue star-themed fake cake box. Browse the carousel for inside views.', tone: 'cream', icon: '🧁', image: '/SHOP%20IMGS/blue%20star%20fake%20cake%20box.PNG', images: ['/SHOP%20IMGS/blue%20star%20fake%20cake%20box.PNG', '/SHOP%20IMGS/blue%20inside.PNG'], details: ['Message us on Instagram'] },
  { slug: 'navy-blue-flowers-fake-cake-box', addedOrder: 10, name: 'Navy Blue Flowers Fake Cake Box', category: 'Boxes', status: 'Available', price: '₪19.99', originalPrice: '₪39.99', discountPercent: 50, description: 'A navy blue flower-themed fake cake box. Browse the carousel for an inside view.', tone: 'cream', icon: '🧁', image: '/SHOP%20IMGS/novy-blue%20flowers%20fake%20cake%20boc.PNG', images: ['/SHOP%20IMGS/novy-blue%20flowers%20fake%20cake%20boc.PNG', '/SHOP%20IMGS/navy%20inside.PNG'], details: ['Message us on Instagram'] },
  { slug: 'fake-cake-box', addedOrder: 3, name: 'Fake Cake Box', category: 'Boxes', status: 'Available to order', price: '₪60+', description: 'A cream-decorated heart shaped box.', tone: 'cream', icon: '🧁', image: imageCatalog.shop.named['fake-cake-box'], images: [imageCatalog.shop.named['fake-cake-box'], ...imageCatalog.customOrders.filter(image => image !== imageCatalog.shop.named['fake-cake-box'] && image !== '/CUSTOM%20ORDERS%20IMGS/flowers%20fake%20cake%20box.png')], details: ['You can pick colors and shapes.', 'Height 16cm, width 10cm.', 'Divided inside and containing a mirror.', 'Please order a week before you need it.', 'Delivered ready-made, not as a DIY box.', 'You can add any toppings you like: seashells, cherry, strawberry, or a name.', 'The price changes when you add more details to the box.'] },
  {"slug":"pearl-bow-comb","addedOrder":4,"name":"Pearl Bow Brush","category":"Brushes","status":"Available","price":"₪39.99","description":"A hand-decorated cream brush with a pearl-and-bow-inspired design, adding a sweet little detail to your dressing table.","tone":"cream","icon":"✨","image":"/SHOP%20IMGS/Pearl%20Bow%20Comb.png","details":["You can pick colors and shapes.","Message us on Instagram"]},
  {"slug":"beach-seashell-case","addedOrder":5,"name":"Beach Seashell Case","category":"Phone Cases","status":"Available","price":"₪35","description":"A beach-inspired cream phone case with a seashell theme, made to carry a little seaside charm wherever you go.","tone":"cream","icon":"✨","image":"/SHOP%20IMGS/beach%20seashell%20case.png","details":["You can pick colors and shapes.","Message us on Instagram"]},
  {"slug":"sea-cream-mirror","addedOrder":6,"name":"Sea Cream Mirror","category":"Mirrors","status":"Available","price":"₪45","description":"A hand-decorated cream mirror inspired by the sea, bringing a dreamy coastal touch to your daily routine.","tone":"cream","icon":"✨","image":"/SHOP%20IMGS/sea%20cream%20mirror.png","details":["You can pick colors and shapes.","Message us on Instagram"]},
  {"slug":"seashell-soft-case","addedOrder":7,"name":"Seashell Soft Case","category":"Phone Cases","status":"Available","price":"₪35","description":"A cream-decorated phone case with a soft seashell-inspired look and a delicate, handmade finish.","tone":"cream","icon":"✨","image":"/SHOP%20IMGS/seashell%20soft%20case.png","details":["You can pick colors and shapes.","Message us on Instagram"]},
  {"slug":"summer-cream-mirror","addedOrder":8,"name":"Summer Cream Mirror","category":"Mirrors","status":"Available","price":"₪29.99","description":"A summer-inspired cream mirror with a playful handmade finish, bringing a little sunshine to your everyday touch-ups.","tone":"cream","icon":"✨","image":"/SHOP%20IMGS/summer%20cream%20mirror.png","details":["You can pick colors and shapes.","Message us on Instagram"]},
].map((product, defaultOrder) => ({
  ...product,
  defaultOrder,
  priceValue: Number.parseFloat(product.price.replace(/[^0-9.]/g, ''))
}));
export const legacyProducts = organizeProducts(originalProducts);

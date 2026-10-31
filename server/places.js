"use strict";
/* Demo sponsored places, invented for testing. Replace with real partner venues
   (set demo = 0) once restaurants sign up. */
const DEMO_PLACES = [
  { id: "tk1", city: "Tashkent", name: "Choyxona Bog'bon", type: "choyxona", area: "Chilonzor", price: 90000, offer: "Free green tea and non for Gapjon groups", room: "Tapchans for up to 16" },
  { id: "tk2", city: "Tashkent", name: "Lagan House", type: "restaurant", area: "Yunusobod", price: 150000, offer: "10% off for groups of 8 or more", room: "Private hall for up to 30" },
  { id: "tk3", city: "Tashkent", name: "Do'stlar Davrasi", type: "choyxona", area: "Mirzo Ulug'bek", price: 80000, offer: "Plov for 10 at a fixed group price", room: "Garden tapchans for up to 20" },
  { id: "tk4", city: "Tashkent", name: "Sharq Saroyi", type: "restaurant", area: "Yakkasaroy", price: 180000, offer: "Free dessert platter for gap groups", room: "VIP room for up to 14" },
  { id: "tk5", city: "Tashkent", name: "Navro'z Bog'i", type: "choyxona", area: "Sergeli", price: 70000, offer: "Free private room Monday to Thursday", room: "Rooms for up to 25" },
  { id: "sm1", city: "Samarkand", name: "Choyxona Siyob Bo'yi", type: "choyxona", area: "Siyob", price: 75000, offer: "Free green tea for Gapjon groups", room: "Tapchans for up to 18" },
  { id: "sm2", city: "Samarkand", name: "Afrosiyob Saroyi", type: "restaurant", area: "Old City", price: 140000, offer: "10% off on weekdays", room: "Hall for up to 40" },
  { id: "sm3", city: "Samarkand", name: "Samarqand Davrasi", type: "choyxona", area: "Kaftarcha", price: 70000, offer: "Plov for 10 at a fixed group price", room: "Garden for up to 20" },
  { id: "bx1", city: "Bukhara", name: "Choyxona Eski Shahar", type: "choyxona", area: "Old Town", price: 70000, offer: "Free green tea and non for Gapjon groups", room: "Courtyard for up to 20" },
  { id: "bx2", city: "Bukhara", name: "Somoniy Bog'i", type: "restaurant", area: "Samanid Park", price: 130000, offer: "10% off for groups of 8 or more", room: "Terrace for up to 30" },
  { id: "bx3", city: "Bukhara", name: "Buxoro Davrasi", type: "choyxona", area: "Kogon road", price: 65000, offer: "Free private room on weekdays", room: "Rooms for up to 16" },
  { id: "fg1", city: "Fergana", name: "Choyxona Marg'ilon Yo'li", type: "choyxona", area: "City centre", price: 65000, offer: "Free green tea for Gapjon groups", room: "Tapchans for up to 18" },
  { id: "fg2", city: "Fergana", name: "Atlas Bog'i", type: "restaurant", area: "Al-Farg'oniy", price: 120000, offer: "Free dessert platter for gap groups", room: "Hall for up to 35" },
  { id: "nm1", city: "Namangan", name: "Choyxona Gulshan", type: "choyxona", area: "City centre", price: 60000, offer: "Plov for 10 at a fixed group price", room: "Garden for up to 20" },
  { id: "nm2", city: "Namangan", name: "Namangan Saroyi", type: "restaurant", area: "Davlatobod", price: 110000, offer: "10% off for groups of 8 or more", room: "Private hall for up to 25" },
  { id: "an1", city: "Andijan", name: "Choyxona Bobur Bog'i", type: "choyxona", area: "City centre", price: 60000, offer: "Free green tea and non for Gapjon groups", room: "Tapchans for up to 16" },
  { id: "an2", city: "Andijan", name: "Andijon Saroyi", type: "restaurant", area: "Bog'ishamol", price: 115000, offer: "Free private room on weekdays", room: "Hall for up to 30" }
];
const CITIES = ["Tashkent", "Samarkand", "Bukhara", "Fergana", "Namangan", "Andijan"];
module.exports = { DEMO_PLACES, CITIES };

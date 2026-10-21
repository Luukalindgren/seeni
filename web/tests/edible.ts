// Text the app shows must never state edibility (hard rule 8). The same patterns as EDIBLE in
// training/src/seeni/species.py; the tests share this one copy. The English pattern leaves
// out a plain "eat", which the warnings need ("never eat a mushroom based on this app").
export const EDIBLE = /syötäv|syödä|syöd|ruokasien|herkullinen|maukas|edible|delicious|tasty|food mushroom|good to eat|safe to eat|can be eaten/i

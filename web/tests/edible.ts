// Text the app shows must never state edibility (hard rule 8). The same patterns as EDIBLE in
// training/src/seeni/species.py; the tests share this one copy. The English pattern leaves
// out a plain "eat", which the warnings need ("never eat a mushroom based on this app"), and
// "edib" also catches "edibility".
export const EDIBLE = /syötäv|syödä|syöd|ruokasien|herkullinen|maukas|edib|eaten|eatable|culinary|\bchoice\b|delicious|tasty|food mushroom|good to eat|safe to eat/i

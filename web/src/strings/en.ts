// The app's English strings (#52), with the same keys as fi.ts.
// Safety (hard rule 8): no string states that a mushroom is edible.

import type { Strings } from "./fi.ts";

export const en: Strings = {
  htmlTitle: "Seeni",
  description: "A mushroom identification aid that works offline.",
  reminder:
    "An identification is never certain. Never eat a mushroom based on this app.",

  warningTitle: "Before you start",
  warningText:
    "Seeni suggests mushroom species from a photo and shows their dangerous lookalikes. It does not tell whether a mushroom can be eaten, and its results cannot be trusted completely. The species information is an unreviewed draft.",
  warningNever: "Never eat a mushroom based on this app.",
  warningVerify:
    "Always confirm the identification with a mushroom expert or a reliable source.",
  warningFine:
    "Photos are processed only on this device, and nothing is sent anywhere. The code is MIT licensed, the model and species information CC BY 4.0. Photographers and sources are listed later under About and sources.",
  consentCheck:
    "I understand that the identification may be wrong, and I will not eat a mushroom based on the app.",
  accept: "I accept",

  newPhoto: "New photo",
  info: "About and sources",
  language: "Suomeksi",
  languageShort: "FI",

  addingTitle: "Add a photo of the same mushroom",
  addingTips:
    "Good angles: the cap from above, the underside of the cap, the stem and its base.",
  backToResult: "Back to the result",
  liveTitle: "Photograph a mushroom",
  intro: "Seeni suggests a species and tells you how to make sure.",
  introHome:
    "Photograph a mushroom, and Seeni suggests a species and tells you how to make sure.",
  takePhoto: "Take a photo",
  pickPhoto: "Choose a photo",
  back: "Back",
  dropPhoto: "Drop a photo",
  hint: "It works best when the whole mushroom is visible. You can choose several photos of the same mushroom.",
  liveRetry: "Use the live camera",
  liveHelp:
    "The camera did not start. If it is blocked, allow it in Safari from the aA menu in the address bar: Website Settings → Camera → Allow. In the home-screen app, close the app and open it again. On Android, allow the camera from the lock icon in the address bar. If another app is using the camera, close it.",
  loadingModel: "Loading the model…",
  loadingModelPercent: (percent: number) => `Loading the model… ${percent}%`,
  ready: "Ready",
  readyOffline: "Ready · works offline",
  modelFailed: (message: string) => `Loading the model failed: ${message}`,
  workerFailed: (message: string) => `The identifier does not work: ${message}`,
  workerError: "error in the identifier",
  workerMessageError: "a message from the identifier could not be read",
  identifying: "Identifying…",

  camera: "Camera",
  cancel: "Cancel",
  webcamFailed:
    "The camera could not be used. You can choose a photo from the device.",

  photoCredit: (author: string, license: string) =>
    `Photo: ${author}, ${license}`,
  model3dCredit: (author: string, license: string) =>
    `3D model from a photo: ${author}, ${license}`,
  model3dDrawn: "3D model drawn for Seeni",
  model3dLabel: (name: string) =>
    `${name}, 3D model. Turn it by dragging or with the arrow keys.`,
  show3d: "Show 3D model",
  showPhoto: "Show photo",
  identifyNew: "Identify another mushroom",
  notSureTitle: "I cannot identify this reliably",
  notSureText:
    "The mushroom may be a species Seeni does not know, or the photo may be unclear.",
  notSureHow: "Photograph the whole mushroom close up and in good light:",
  notSureTips: [
    "The cap from above",
    "The underside of the cap",
    "The base of the stem",
  ],
  notSureDanger: "The photo somewhat resembles these dangerous species:",
  answersFit: "Your answers fit this species.",
  modelEstimate: (percent: number) => `Model estimate: ${percent} %`,
  estimateLabel: "model estimate",
  percent: (percent: number) => `${percent} %`,
  percentBelowOne: "< 1 %",
  notRuledOut: "not ruled out",
  lookalikesTitle: "Lookalikes and other options",
  verifyTitle: "How to make sure",
  cannotCheck: "I cannot check this",
  cannotRuleOut:
    "This app cannot rule out the dangerous lookalikes. Confirm the species with a mushroom expert.",
  checkedTitle: "What you checked",
  yourPhotos: "Your photos",
  yourPhoto: (n: number) => `Your photo ${n}`,
  removePhoto: (n: number) => `Remove photo ${n}`,
  addPhoto: "Add a photo of the same mushroom",
  tooManyPhotos: (max: number, left: number) =>
    `At most ${max} photos are used for one mushroom. ${left} ${left === 1 ? "photo was" : "photos were"} left out.`,
  failed: "Identification failed",
  unreadableTitle: "The photo could not be opened",
  unreadableText:
    "The file is not an image, or the browser cannot read its format. Try a JPEG or PNG photo. iPhone HEIC photos open in Safari, but not always in other browsers.",
  unreadablePhotos: (n: number) =>
    n === 1
      ? "One photo could not be opened, so it was left out."
      : `${n} photos could not be opened, so they were left out.`,
  or: " or ",

  placeTitle: "Find spot",
  placeSave: "Save the find spot",
  placeLoading: "Getting the location…",
  placeFailed:
    "No location was found. The photo has no location, and using the location is blocked or did not work.",
  placeNote:
    "The location is read from the photo or the phone only when you tap. It does not leave the device unless you open the map or share it.",
  placeFromPhoto: "Location from the photo.",
  placeCurrent: "Your current location.",
  placeApple: "Open in Apple Maps",
  placeGoogle: "Open in Google Maps",
  share: "Share",
  placeForget: "Forget the location",
  placeLabel: "Find spot",

  recipesTitle: "Recipes",
  recipesGuideNote:
    "The species guide does not identify your mushroom. Only cook a mushroom that a mushroom advisor has confirmed, and check its lookalikes first.",
  recipesNote:
    "Cook only a mushroom that a mushroom advisor has confirmed. The links open a recipe site.",

  previousSpecies: "Previous species",
  close: "Close",
  sheetWarningOnly:
    "Seeni cannot recognize this species from a photo. It can be ruled out only by checking its features.",
  sheetFeatures: "Features",
  sheetCompare: (nimi: string) => `How to tell it from ${nimi}`,
  sheetNoDifference:
    "The checks show no difference between these. Confirm the species with a mushroom expert.",
  sheetLookalikes: "Its lookalikes",
  sheetSources: "Sources",

  groupTappava: "Deadly poisonous",
  groupMyrkyllinen: "Poisonous",
  groupEsikasiteltava: "Poisonous raw",

  galleryTitle: "More photos",
  galleryOpen: "More photos and features",
  pictureLabel: (captions: string) => `Picture: ${captions}`,

  seasonRare: (month: string, region: string | null) =>
    `A rare find ${region ? `${region} ` : ""}${month}: there are few observations then. Check the species with extra care.`,
  months: [
    "in January",
    "in February",
    "in March",
    "in April",
    "in May",
    "in June",
    "in July",
    "in August",
    "in September",
    "in October",
    "in November",
    "in December",
  ],
  regions: {
    etela: "southern Finland",
    keski: "central Finland",
    pohjoinen: "northern Finland",
  },
  regionsIn: {
    etela: "in southern Finland",
    keski: "in central Finland",
    pohjoinen: "in northern Finland",
  },
  seasonTitle: "Time of year and region",
  seasonText:
    "Seeni compares the suggested species with GBIF observations from Finland and tells you if it is rarely found at that time of year. The month is read from the photo or taken from today, the region from the photo’s location or chosen below. Nothing leaves the device.",
  seasonToggle: "Compare with the time of year and region",
  seasonRegion: "Region when the photo has no location",
  seasonRegionAuto: "Not chosen",

  // Install as an app
  installOpen: "Install as an app",
  installTitle: "Install Seeni",
  installWhy:
    "Opened from the home screen, Seeni fills the screen and works offline, and the browser keeps the finds saved in it even if you do not use it for a week.",
  installFinds:
    "The home-screen Seeni has its own data. To move your finds, first save a backup in My finds, then restore it in the app.",
  installStep1:
    "Tap the browser’s Share button (a square with an arrow pointing up).",
  installStep2:
    "Choose Add to Home Screen. If you do not see it, scroll the menu down.",
  installStep3:
    "Tap Add. From then on, open Seeni from its icon on the home screen.",

  guideTitle: "Species guide",
  guideNote:
    "Every species Seeni recognizes, and the dangerous species it warns about. Open a species to see its features and lookalikes.",
  guideSearch: "Search for a species",
  guideNone: "No species found.",
  findsTitle: "My finds",
  findsOpen: (n: number) => `My finds (${n})`,
  findsSave: "Save to my finds",
  findsSaved: "Saved to my finds.",
  findsFailed: "Saving failed. Try again.",
  findsNote:
    "Finds are kept on this device only. They are the app’s suggestions, not confirmed species.",
  findsEmpty: "No saved finds.",
  findsUnknown: "Unidentified mushroom",
  findsDanger: (names: string) => `Dangerous lookalikes: ${names}`,
  findsMap: "On the map",
  findsDelete: "Delete",
  findsExport: "Save a backup",
  findsImport: "Restore from a backup",
  findsBackupNote:
    "The browser may sometimes clear a website’s data. A backup is a file you keep yourself.",
  findsImported: (n: number) =>
    n === 0
      ? "The backup had no new finds."
      : n === 1
        ? "1 find was restored."
        : `${n} finds were restored.`,
  findsImportFailed:
    "The file could not be read. Choose a backup saved by Seeni.",

  aboutText:
    "Seeni does not tell whether a mushroom can be eaten. It suggests species, shows their dangerous lookalikes and guides you to check their features. Photos are processed only on this device, and nothing is sent anywhere. The species information is an unreviewed draft.",
  aboutSourcesHtml: `The model was trained on photos shared through <a href="https://www.gbif.org/">GBIF</a>
      under CC0 or CC BY licences (GBIF.org, downloads
      <a href="https://doi.org/10.15468/dl.fadmpu">10.15468/dl.fadmpu</a> and
      <a href="https://doi.org/10.15468/dl.3x49qy">10.15468/dl.3x49qy</a>). Species names are from the
      <a href="https://doi.org/10.15468/39omei">GBIF taxonomy</a> and
      <a href="https://laji.fi/">Laji.fi</a> (CC BY 4.0), the species chosen from the Finnish Food
      Authority's list of commercial mushrooms. The model is based on EfficientNet-B0 weights
      (<a href="https://huggingface.co/timm/efficientnet_b0.ra_in1k">timm</a>, Apache-2.0) and
      runs in the browser with <a href="https://github.com/microsoft/onnxruntime">onnxruntime-web</a> (MIT).
      Licences: code MIT, model and species information CC BY 4.0.
      <a href="https://github.com/Luukalindgren/seeni">Source code</a>.`,
  aboutTranslation:
    "The English species information is translated from the Finnish. The English names are common names; Finnish sources and names are the reference.",
  photographers: "Photographers",
  loading: "Loading…",
  trainedOn: (n: number) =>
    `The model was trained on ${n} photos. Thank you to all the photographers. Data: `,
  photographer: (name: string, n: number, licenses: string) =>
    `${name} (${n} photo${n === 1 ? "" : "s"}, ${licenses})`,
  listFailed: (e: string) => `Loading the list failed: ${e}`,
};

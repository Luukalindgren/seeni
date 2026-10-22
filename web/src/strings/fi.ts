// The app's Finnish strings (#52), the default language. en.ts has the same keys.
// Safety (hard rule 8): no string states that a mushroom is edible; tests/strings.test.ts
// checks every string of both languages.

export const fi = {
  htmlTitle: 'Seeni',
  description: 'Sienten tunnistuksen apuväline, joka toimii ilman verkkoa.',
  reminder: 'Tunnistus ei ole koskaan varma. Älä syö sientä tämän sovelluksen perusteella.',

  // Consent (#44)
  warningTitle: 'Ennen kuin aloitat',
  warningText:
    'Seeni ehdottaa sienilajeja kuvasta ja näyttää niiden vaaralliset näköislajit. Se ei kerro, voiko sientä syödä, eikä sen tuloksiin voi luottaa sataprosenttisesti. Lajitiedot ovat tarkistamattomia luonnoksia.',
  warningNever: 'Älä koskaan syö sientä tämän sovelluksen perusteella.',
  warningVerify: 'Varmista tunnistus aina sieneuvojalta tai luotettavasta lähteestä.',
  warningFine:
    'Kuvat käsitellään vain tällä laitteella, eikä mitään lähetetä minnekään. Koodi on MIT-lisensoitu, malli ja lajitiedot CC BY 4.0. Kuvaajat ja lähteet löydät myöhemmin kohdasta Tietoa ja lähteet.',
  consentCheck: 'Ymmärrän, että tunnistus voi olla väärä, enkä syö sientä sovelluksen perusteella.',
  accept: 'Hyväksyn',

  // Header
  newPhoto: 'Uusi kuva',
  info: 'Tietoa ja lähteet',
  language: 'In English',
  languageShort: 'EN',

  // Home
  addingTitle: 'Lisää kuva samasta sienestä',
  addingTips: 'Hyviä kulmia: lakki ylhäältä, lakin alapinta, jalka ja tyvi.',
  backToResult: 'Takaisin tulokseen',
  liveTitle: 'Kuvaa sieni',
  intro: 'Seeni ehdottaa lajia ja kertoo, miten sen voi varmistaa.',
  introHome: 'Kuvaa sieni, niin Seeni ehdottaa lajia ja kertoo, miten sen voi varmistaa.',
  takePhoto: 'Ota kuva',
  pickPhoto: 'Valitse kuva',
  back: 'Takaisin',
  dropPhoto: 'Pudota kuva',
  hint: 'Parhaiten onnistuu, kun koko sieni näkyy. Voit valita useita kuvia samasta sienestä.',
  liveRetry: 'Käytä live-kameraa',
  liveHelp:
    'Kamera ei käynnistynyt. Jos sen käyttö on estetty, salli se Safarissa osoiterivin aA-valikosta: Verkkosivuston asetukset → Kamera → Salli. Kotinäytön sovelluksessa sulje sovellus ja avaa se uudelleen. Androidissa salli kamera osoiterivin lukkokuvakkeesta. Jos kamera on toisen sovelluksen käytössä, sulje se.',
  loadingModel: 'Ladataan mallia…',
  loadingModelPercent: (percent: number) => `Ladataan mallia… ${percent} %`,
  ready: 'Valmis',
  readyOffline: 'Valmis · toimii ilman verkkoa',
  modelFailed: (message: string) => `Mallin lataus epäonnistui: ${message}`,
  workerFailed: (message: string) => `Tunnistin ei toimi: ${message}`,
  workerError: 'virhe tunnistimessa',
  workerMessageError: 'viesti tunnistimelta ei kelvannut',
  identifying: 'Tunnistetaan…',

  // Webcam
  camera: 'Kamera',
  cancel: 'Peruuta',
  webcamFailed: 'Kameraa ei saatu käyttöön. Voit valita kuvan laitteelta.',

  // Result
  photoCredit: (author: string, license: string) => `Kuva: ${author}, ${license}`,
  identifyNew: 'Tunnista uusi sieni',
  notSureTitle: 'En tunnista varmasti',
  notSureText: 'Sieni voi olla laji, jota Seeni ei tunne, tai kuva voi olla epäselvä.',
  notSureHow: 'Kuvaa koko sieni läheltä ja hyvässä valossa:',
  notSureTips: ['Lakki ylhäältä', 'Lakin alapinta', 'Jalan tyvi'],
  notSureDanger: 'Kuva muistuttaa jonkin verran näitä vaarallisia lajeja:',
  answersFit: 'Vastauksesi sopivat tähän lajiin.',
  modelEstimate: (percent: number) => `Mallin arvio: ${percent} %`,
  lookalikesTitle: 'Näköislajit ja muut vaihtoehdot',
  verifyTitle: 'Näin varmistat lajin',
  cannotCheck: 'En pysty tarkistamaan tätä',
  cannotRuleOut: 'Vaarallisia näköislajeja ei voi sulkea pois tällä sovelluksella. Varmista laji sieneuvojalta.',
  checkedTitle: 'Tarkistamasi asiat',
  yourPhotos: 'Kuvasi',
  yourPhoto: (n: number) => `Kuvasi ${n}`,
  removePhoto: (n: number) => `Poista kuva ${n}`,
  addPhoto: 'Lisää kuva samasta sienestä',
  tooManyPhotos: (max: number, left: number) =>
    `Yhdestä sienestä käytetään enintään ${max} kuvaa. ${left} kuvaa jätettiin pois.`,
  failed: 'Tunnistus epäonnistui',
  unreadableTitle: 'Kuvaa ei voitu avata',
  unreadableText:
    'Tiedosto ei ole kuva, tai selain ei osaa lukea sen muotoa. Kokeile JPEG- tai PNG-kuvaa. iPhonen HEIC-kuvat aukeavat Safarissa, mutta eivät aina muissa selaimissa.',
  unreadablePhotos: (n: number) =>
    n === 1 ? 'Yhtä kuvaa ei voitu avata, joten se jätettiin pois.' : `${n} kuvaa ei voitu avata, joten ne jätettiin pois.`,
  or: ' tai ',

  // Find spot (#51)
  placeTitle: 'Löytöpaikka',
  placeSave: 'Tallenna löytöpaikka',
  placeLoading: 'Haetaan sijaintia…',
  placeFailed: 'Sijaintia ei saatu. Kuvassa ei ole sijaintia, ja sijainnin käyttö on estetty tai ei onnistunut.',
  placeNote: 'Sijainti luetaan kuvasta tai puhelimesta vain, kun painat. Se ei lähde laitteelta, ellet avaa karttaa tai jaa sitä.',
  placeFromPhoto: 'Sijainti kuvasta.',
  placeCurrent: 'Nykyinen sijaintisi.',
  placeApple: 'Avaa Apple Mapsissa',
  placeGoogle: 'Avaa Google Mapsissa',
  share: 'Jaa',
  placeForget: 'Unohda sijainti',
  placeLabel: 'Löytöpaikka',

  // Species sheet (#47)
  previousSpecies: 'Edellinen laji',
  close: 'Sulje',
  sheetWarningOnly: 'Seeni ei tunnista tätä lajia kuvasta. Sen voi sulkea pois vain tarkistamalla tuntomerkit.',
  sheetFeatures: 'Tuntomerkit',
  sheetCompare: (nimi: string) => `Näin erotat lajista ${nimi}`,
  sheetNoDifference: 'Tarkistuksista ei löydy eroa näiden välillä. Varmista laji sieneuvojalta.',
  sheetLookalikes: 'Sen näköislajit',
  sheetSources: 'Lähteet',

  // Danger labels; a class that is not dangerous gets none (never an edibility label).
  groupTappava: 'Tappavan myrkyllinen',
  groupMyrkyllinen: 'Myrkyllinen',
  groupEsikasiteltava: 'Myrkyllinen raakana',

  // Check pictures
  pictureLabel: (captions: string) => `Kuva: ${captions}`,

  // Time of year and region (#48)
  seasonRare: (month: string, region: string | null) =>
    `Harvinainen löytö ${month}${region ? ` ${region}` : ''}: havaintoja on silloin vähän. Tarkista laji erityisen huolellisesti.`,
  months: ['tammikuussa', 'helmikuussa', 'maaliskuussa', 'huhtikuussa', 'toukokuussa', 'kesäkuussa', 'heinäkuussa', 'elokuussa', 'syyskuussa', 'lokakuussa', 'marraskuussa', 'joulukuussa'],
  regions: { etela: 'Etelä-Suomi', keski: 'Keski-Suomi', pohjoinen: 'Pohjois-Suomi' } as Record<'etela' | 'keski' | 'pohjoinen', string>,
  regionsIn: { etela: 'Etelä-Suomessa', keski: 'Keski-Suomessa', pohjoinen: 'Pohjois-Suomessa' } as Record<'etela' | 'keski' | 'pohjoinen', string>,
  seasonTitle: 'Ajankohta ja alue',
  seasonText:
    'Seeni vertaa ehdotettua lajia GBIFin havaintoihin Suomesta ja kertoo, jos lajia löytyy harvoin siihen aikaan vuodesta. Kuukausi luetaan kuvasta tai otetaan tästä päivästä, alue kuvan sijainnista tai alta. Tieto ei lähde laitteelta.',
  seasonToggle: 'Vertaa ajankohtaan ja alueeseen',
  seasonRegion: 'Alue, kun kuvassa ei ole sijaintia',
  seasonRegionAuto: 'Ei valittu',

  // Install as an app
  installOpen: 'Asenna sovellukseksi',
  installTitle: 'Asenna Seeni',
  installWhy:
    'Kotivalikosta avattuna Seeni täyttää koko näytön ja toimii ilman verkkoa, eikä selain poista siihen tallennettuja löytöjä, vaikka et käyttäisi sitä viikkoon.',
  installFinds:
    'Kotivalikon Seenillä on omat tietonsa. Siirrä omat löytösi tallentamalla ensin varmuuskopio Omista löydöistä ja palauttamalla se sovelluksessa.',
  installStep1: 'Napauta selaimen Jaa-painiketta (neliö, josta nuoli osoittaa ylös).',
  installStep2: 'Valitse Lisää Koti-valikkoon. Jos sitä ei näy, vieritä valikkoa alaspäin.',
  installStep3: 'Napauta Lisää. Seeni aukeaa jatkossa Koti-valikon kuvakkeesta.',

  // Species guide
  guideTitle: 'Lajiopas',
  guideNote: 'Kaikki lajit, jotka Seeni tunnistaa, ja vaaralliset lajit, joista se varoittaa. Avaa laji, niin näet sen tuntomerkit ja näköislajit.',
  guideSearch: 'Hae lajia',
  guideNone: 'Lajia ei löytynyt.',

  // My finds
  findsTitle: 'Omat löydöt',
  findsOpen: (n: number) => `Omat löydöt (${n})`,
  findsSave: 'Tallenna omiin löytöihin',
  findsSaved: 'Tallennettu omiin löytöihin.',
  findsFailed: 'Tallennus ei onnistunut. Yritä uudelleen.',
  findsNote: 'Löydöt tallentuvat vain tälle laitteelle. Ne ovat sovelluksen ehdotuksia, eivät varmistettuja lajeja.',
  findsEmpty: 'Ei tallennettuja löytöjä.',
  findsUnknown: 'Tunnistamaton sieni',
  findsDanger: (names: string) => `Vaaralliset näköislajit: ${names}`,
  findsMap: 'Kartalla',
  findsDelete: 'Poista',
  findsExport: 'Tallenna varmuuskopio',
  findsImport: 'Palauta varmuuskopiosta',
  findsBackupNote: 'Selain voi joskus poistaa sivuston tiedot. Varmuuskopio on tiedosto, jonka säilytät itse.',
  findsImported: (n: number) =>
    n === 0 ? 'Varmuuskopiossa ei ollut uusia löytöjä.' : n === 1 ? '1 löytö palautettiin.' : `${n} löytöä palautettiin.`,
  findsImportFailed: 'Tiedostoa ei voitu lukea. Valitse Seenin tallentama varmuuskopio.',

  // About
  aboutText:
    'Seeni ei kerro, voiko sientä syödä. Se ehdottaa lajeja, näyttää niiden vaaralliset näköislajit ja ohjaa tarkistamaan tuntomerkit. Kuvat käsitellään vain tällä laitteella, eikä mitään lähetetä minnekään. Lajitiedot ovat tarkistamattomia luonnoksia.',
  // Trusted markup with links, written here only.
  aboutSourcesHtml: `Malli on opetettu valokuvilla, jotka on jaettu <a href="https://www.gbif.org/">GBIF</a>in
      kautta CC0- tai CC BY -lisenssillä (GBIF.org, lataukset
      <a href="https://doi.org/10.15468/dl.fadmpu">10.15468/dl.fadmpu</a> ja
      <a href="https://doi.org/10.15468/dl.3x49qy">10.15468/dl.3x49qy</a>). Lajien nimet ovat
      <a href="https://doi.org/10.15468/39omei">GBIFin taksonomiasta</a> ja
      <a href="https://laji.fi/">Laji.fi:stä</a> (CC BY 4.0), lajivalinta Ruokaviraston
      kauppasienilistasta. Malli perustuu EfficientNet-B0-painoihin
      (<a href="https://huggingface.co/timm/efficientnet_b0.ra_in1k">timm</a>, Apache-2.0) ja
      toimii selaimessa <a href="https://github.com/microsoft/onnxruntime">onnxruntime-webillä</a> (MIT).
      Lisenssit: koodi MIT, malli ja lajitiedot CC BY 4.0.
      <a href="https://github.com/Luukalindgren/seeni">Lähdekoodi</a>.`,
  aboutTranslation: '',
  photographers: 'Kuvaajat',
  loading: 'Ladataan…',
  trainedOn: (n: number) => `Malli on opetettu ${n} kuvalla. Kiitos kaikille kuvaajille. Aineistot: `,
  photographer: (name: string, n: number, licenses: string) => `${name} (${n} kuva${n === 1 ? '' : 'a'}, ${licenses})`,
  listFailed: (e: string) => `Luettelon lataus epäonnistui: ${e}`,
}

export type Strings = typeof fi

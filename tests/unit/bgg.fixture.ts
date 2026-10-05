export const THING_XML = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="167791">
    <thumbnail src="https://cf.geekdo-images.com/t.jpg"/>
    <image src="https://cf.geekdo-images.com/f.jpg"/>
    <name type="primary" sortindex="1" value="Terraforming Mars"/>
    <yearpublished value="2016"/>
    <minplayers value="1"/>
    <maxplayers value="5"/>
    <playingtime value="120"/>
    <link type="boardgamepublisher" id="18037" value="FryxGames"/>
    <link type="boardgamedesigner" id="52075" value="Jacob Fryxelius"/>
    <link type="boardgameartist" id="62819" value="Isaac Fryxelius"/>
    <link type="boardgameartist" id="62820" value="Daniel Fryxelius"/>
    <poll name="userplayers" title="User Suggested Number of Players" totalvotes="100">
      <results numplayers="1">
        <result value="Best" votes="2"/>
        <result value="Recommended" votes="10"/>
        <result value="Not Recommended" votes="88"/>
      </results>
      <results numplayers="3">
        <result value="Best" votes="61"/>
        <result value="Recommended" votes="30"/>
        <result value="Not Recommended" votes="9"/>
      </results>
      <results numplayers="5">
        <result value="Best" votes="37"/>
        <result value="Recommended" votes="40"/>
        <result value="Not Recommended" votes="23"/>
      </results>
    </poll>
    <statistics page="1">
      <ratings>
        <average value="8.355"/>
        <averageweight value="3.32"/>
      </ratings>
    </statistics>
  </item>
</items>`;

// Forme XMLAPI2 /collection RÉELLE (épinglée sur une vraie réponse BGG, 2026-10-05) :
// name/yearpublished/image/thumbnail/numplays sont du CONTENU TEXTE — pas des
// attributs @value. (Le fixture v3.6.0 supposait des @value : l'import n'avait
// jamais tourné avec de vraies données faute d'auth — d'où l'import vide v4.3.1.)
export const COLLECTION_XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<items totalitems="2" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse" pubdate="Mon, 05 Oct 2026 20:50:29 +0000">
  <item objecttype="thing" objectid="174430" subtype="boardgame" collid="9001">
    <name sortindex="1">Gloomhaven</name>
    <yearpublished>2017</yearpublished>
    <image>https://cf.geekdo-images.com/f-gh.jpg</image>
    <thumbnail>https://cf.geekdo-images.com/t-gh.jpg</thumbnail>
    <status own="1" prevowned="0" fortrade="0" want="0" wanttoplay="0" wanttobuy="0" wishlist="0" preordered="0" lastmodified="2026-10-05 15:49:01"/>
    <numplays>7</numplays>
  </item>
  <item objecttype="thing" objectid="266192" subtype="boardgame" collid="9002">
    <name sortindex="1">Wingspan</name>
    <yearpublished>2019</yearpublished>
    <thumbnail>https://cf.geekdo-images.com/t-ws.jpg</thumbnail>
    <status own="1" prevowned="0" fortrade="0" want="0" wanttoplay="0" wanttobuy="0" wishlist="0" preordered="0" lastmodified="2026-10-05 15:49:01"/>
    <numplays>0</numplays>
  </item>
</items>`;

export const COLLECTION_ERRORS_XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<errors>
  <error>
    <message>Invalid username specified</message>
  </error>
</errors>`;

// Forme XMLAPI2 /search RÉELLE (épinglée 2026-10-05, requête avec token) :
// année en attribut @value (comme /thing) ; AUCUNE image dans les résultats —
// les pochettes ne peuvent venir que de /thing (une fiche par appel, garde 1 req/s).
export const SEARCH_XML = `<?xml version="1.0" encoding="utf-8"?>
<items total="3" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="266192">
    <name type="primary" value="Wingspan"/>
    <yearpublished value="2019"/>
  </item>
  <item type="boardgame" id="366161">
    <name type="primary" value="Wingspan Asia"/>
    <yearpublished value="2022"/>
  </item>
  <item type="boardgame" id="473508">
    <name type="primary" value="Wingspan Pocket"/>
  </item>
</items>`;

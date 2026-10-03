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

// Forme XMLAPI2 /collection : @objectid (attribut), name/yearpublished/thumbnail en @value.
// (thing, lui, met l'image dans @src — le parseur accepte les deux.)
export const COLLECTION_XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<items total="2" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item objectid="174430" collid="9001" subtype="boardgame">
    <name sortindex="1" value="Gloomhaven"/>
    <yearpublished value="2017"/>
    <image value="https://cf.geekdo-images.com/f-gh.jpg"/>
    <thumbnail value="https://cf.geekdo-images.com/t-gh.jpg"/>
    <status own="1" prevowned="0" fortrade="0" want="0" wanttoplay="0" wanttobuy="0" wishlist="0"/>
    <numplays value="7"/>
  </item>
  <item objectid="266192" collid="9002" subtype="boardgame">
    <name sortindex="1" value="Wingspan"/>
    <yearpublished value="2019"/>
    <thumbnail src="https://cf.geekdo-images.com/t-ws.jpg"/>
    <status own="1" prevowned="0" fortrade="0" want="0" wanttoplay="0" wanttobuy="0" wishlist="0"/>
    <numplays value="0"/>
  </item>
</items>`;

export const COLLECTION_ERRORS_XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<errors>
  <error>
    <message>Invalid username specified</message>
  </error>
</errors>`;

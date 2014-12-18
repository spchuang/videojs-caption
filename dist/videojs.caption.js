/*! videojs-caption - v0.4.0 - 2014-12-18
* Copyright (c) 2014 ; Licensed  */
(function($,undefined) {
   var POPON = 'pop-on';
   var ROLLUP = 'roll-up';
   var ROLLUP_LENGTH = 3;
   
   // default setting
   var defaults = {
      captionSize: 4,
      captionStyle: {
         'background-color': "rgba(255,0,0,0.8)",
         'color':  'white',
         'padding': "3px"
      },
      onCaptionChange: function(index) {},
      captionType: POPON //pop-on or roll-on
   };

   //return 0 if time is within the cursor
   //return 1 if greater and -1 if smaller
   function isWithinCursor(time, cursor) {
      if (time > cursor.endTime) {
         return 1;
      } else if (time < cursor.startTime) {
         return -1;
      } else {
         return 0;
      }
   }

   function applyCaptionStyle(captionOverlay, cursor) {
      captionOverlay.removeClass("position-HB position-HT position-VR position-VL align-C align-L");
      // default position/alignment is horizontal bottom/center
      if (!cursor.position) {
         captionOverlay.addClass("position-HB");
      } else {
         captionOverlay.addClass("position-" + cursor.position);
      }
      if (!cursor.alignment) {
         captionOverlay.addClass("align-C");
      } else {
         captionOverlay.addClass("align-" + cursor.alignment);
      }
   }

   // convert ruby tags in caption (<RA>, <RB>, <RL>, <RR>) to html5 ruby tags
   function convertRubyTags(text) {
      var regex = /<R.+?value=[\"'](.+?)[\"']>(.+?)<\/R>/ig;
      while(m = regex.exec(text)) {
         text = text.replace(m[0], "<ruby>" + m[2] + "<rt>" + m[1] + "</rt></ruby>");
      }
      return text;
   }

   // add correct stage in group tags <G>text</G>
   function applyGroupTagStyle(text) {
      var regex = /<G>(.+?)<\/G>/ig;
      while (m = regex.exec(text)) {
         text = text.replace(m[0], "<G class='group-tags'>" + m[1] + "</G>");
      }
      return text;
   }

   // register the caption plugin (dependent on jq uery)
   function registerCaptionPlugin(options) {

      var noCaption, cursorID;
      var captionOverlays, numDisplayCaption;
      var captions  = options.data,
         setting = $.extend(true, {}, defaults, options.setting),
         videoWrapper = $(this.el()),
         player = this;

      //initialize caption
      function initialize() {
         //set up caption overlay
         captionOverlays = [];
         numDisplayCaption = 0;
         
         addCaptionOverlay();

         //setup caption cursor
         noCaption = false;
         cursorID = searchCaption(0);
         
         if (setting.captionType === ROLLUP) {
            applyCaptionStyle(captionOverlays[0], {position: 'HB', alignment: 'C'});
            captionOverlays[0].empty();
         }
         
         if (!noCaption) {
            updateCaptionText();
         } else {
            updateCaptionOverlay(0, true);
         }

         //bind timeupdate handle
         player.on("timeupdate", function() {
            ct = this.currentTime() * 1000;
            updateCaptionCursor(ct);
         });
      }
      
      function hideCaption() {
         for (var i = 0; i < numDisplayCaption; i++) {
            updateCaptionOverlay(i, true);
         }
      }

      //currentTime in ms
      function updateCaptionCursor(currentTime) {  
   
         // special case: if playback is missing caption or past the last caption
         if (noCaption) {
            cursorID = searchCaption(currentTime);
            if(noCaption){
               hideCaption();
               return;
            }
            updateCaptionText();
            return;
         }
         
         var cursor = captions[cursorID];
         if (isWithinCursor(currentTime, cursor) == 0) {
            // case 1: if playback stays in the same caption; do nothing
         } else {
            if (currentTime > cursor.endTime && (currentTime - cursor.endTime) < 500) {
               // case 2: video plays continously and move to the next (when change is less than 500ms)
               cursorID++;
               
               // check if we reached the end of the caption
               if (cursorID > captions.length - 1){
                  noCaption = true;
               }
            } else {
               // case 3: user changed playback (fastforward/backtrack); find new caption cursor
               cursorID = searchCaption(currentTime);
            }
         
            if (noCaption) {
               hideCaption();
            } else {
               updateCaptionText();
            }
         }
      }

      //locate the correct caption through binary search
      function searchCaption(currentTime) {
         var minIndex = 0,
             maxIndex = captions.length - 1;
         var currentIndex, isWithin;
         while (minIndex <= maxIndex) {
            currentIndex = Math.ceil((minIndex + maxIndex) / 2);
            
            isWithin = isWithinCursor(currentTime, captions[currentIndex]);
            if (isWithin == 1) {
               minIndex = currentIndex + 1;
            } else if (isWithin == -1) {
               maxIndex = currentIndex - 1;
            } else {
               // found it!
               noCaption = false;
               // the tricky thing is there could be multiple captions starting at the same time
               // so return the cursor index of the first caption
               while (currentIndex > 0 && isWithinCursor(currentTime, captions[currentIndex - 1]) == 0) {
                  currentIndex--;
               }
               return currentIndex;
            }
         }
         // error handling: can't find the caption
         // console.log("[videojs.caption] ERROR searching caption at time " + ct + "ms")
         noCaption = true;
      }


      function updateCaptionText() {
         if (setting.captionType == POPON) {
            updatePopOnCaptionText();
         } else if (setting.captionType == ROLLUP) {
            updateRollUpCaptionText();
         }
      }

      //Roll-up style:
      //Assumption: no overlapping captions (start time should never be the same)
      function updateRollUpCaptionText(){
         captionOverlays[0].css("visibility","visible");
         var cursor = captions[cursorID];

         //if there are already enough rollups, we removed the first and push the next to the end
         if (captionOverlays[0].find('.vjs-caption-overlay-text').length >= ROLLUP_LENGTH) {
            captionOverlays[0].find('.vjs-caption-overlay-text')[0].remove();
         }
         //create new overlay text overlay
         var captionText = convertRubyTags(cursor.data);
         captionText = applyGroupTagStyle(captionText);
         var newOverlayText = $("<span class='vjs-caption-overlay-text'><span></span></span>")
            .css(setting.captionStyle);
         newOverlayText.find('span').html(captionText).addClass('caption-font-size-'+ setting.captionSize);
         
         //append to bottom
         captionOverlays[0].append(newOverlayText);

         numDisplayCaption = 1;
         setting.onCaptionChange(cursorID);
      }
      
      function updateCaptionOverlay(index, hide) {
         if (hide) {
            captionOverlays[index].css("visibility","hidden");
         } else {
            captionOverlays[index].css("visibility","visible");
         }
      }

      //POP-on style: update the caption text along with the postion/alignment style
      function updatePopOnCaptionText() {
         var numNewDisplayCaption = 1;
         //if there are more than one caption at the same time, iterate to the last caption
         while (true) {
            var cursor = captions[cursorID];
            
            //hide the caption if data is empty
            if (!cursor.data) {
               updateCaptionOverlay(numNewDisplayCaption - 1, true);
            } else {
               updateCaptionOverlay(numNewDisplayCaption - 1, false);
            }
            // apply position and alignment style to caption
            applyCaptionStyle(captionOverlays[numNewDisplayCaption - 1], cursor);

            var captionText = convertRubyTags(cursor.data);
            captionText = applyGroupTagStyle(captionText);
            captionOverlays[numNewDisplayCaption - 1].find('.vjs-caption-overlay-text span').html(captionText);

            // check if more than one caption in the same time period (same start and end time)
            if ((cursorID < captions.length - 1) && (
               cursor.startTime != captions[cursorID + 1].startTime || cursor.endTime != captions[cursorID + 1].endTime)) {
               break;
            }
            numNewDisplayCaption++;
            cursorID++;
            
            // if there isn't enough caption overlays, create more
            if(numNewDisplayCaption > captionOverlays.length){
               addCaptionOverlay();
            }
            
            // if we past the caption
            if (cursorID > captions.length - 1) {
               noCaption = true;
               break;
            }
         }
         // hide the captions that aren't displaying
         while (numDisplayCaption > numNewDisplayCaption) {
            updateCaptionOverlay(numDisplayCaption - 1, true);
            numDisplayCaption--;
         }
         numDisplayCaption = numNewDisplayCaption;

         // callback only once for each caption
         setting.onCaptionChange(cursorID);

         // at this point, cursor should point to the last caption for the same time interval
      }

      function addCaptionOverlay() {
         var overlay = $("<div class='vjs-caption-overlay'><span class='vjs-caption-overlay-text'><span></span></span></div>")

         overlay.find('.vjs-caption-overlay-text').css(setting.captionStyle);
         
         captionOverlays.push(overlay);
         videoWrapper.append(overlay);
         applyCaptionSize();
      }

      function applyCaptionSize(){
         videoWrapper.find('.vjs-caption-overlay-text span').each(function() {
            $(this).removeClass().addClass('caption-font-size-'+ setting.captionSize);
         });
      }
      
      player.caption = {
         updateCaption: function(callback) {
            cursorID = searchCaption(ct);
            updateCaptionText();
            if(callback) callback();
            
         },
         loadNewCaption: function() {
            player.pause().currentTime(0);
            captions = newCaption.data;
            cursorID = 0;
            noCaption = false;
            updateCaptionText();
         },
         getRowCursorID: function() {
            return cursorID;
         },
         getCaptionData: function() {
            return captions;
         },
         increaseFontSize: function() {
            setting.captionSize = (setting.captionSize + 1) % 9;
            applyCaptionSize();
         },
         decreaseFontSize: function() {
            setting.captionSize--;
            if(setting.captionSize < 0) setting.captionSize = 8;
            applyCaptionSize();
         },
         changeToRollUp: function() {
            setting.captionType = ROLLUP;
            // change caption to center horizontal bottom
            applyCaptionStyle(captionOverlays[0], {position: 'HB', alignment: 'C'});
            captionOverlays[0].empty();
   
            // hide all caption other than the first one
            while (numDisplayCaption > 1) {
               captionOverlays[numDisplayCaption-1].css("visibility","hidden");
               numDisplayCaption--;
            }
            
         },
         changeToPopOn: function() {
            setting.captionType = POPON;
            // remove the extra caption overlays created in rollup mode
            var rollupOverlaysLength = captionOverlays[0].find('.vjs-caption-overlay-text').length;
   
            while (rollupOverlaysLength > 1) {
               captionOverlays[0].find('.vjs-caption-overlay-text')[0].remove();
               rollupOverlaysLength--;
            }
         }
      }

      initialize();
   }
   
   videojs.plugin('caption', registerCaptionPlugin);
})(jQuery);

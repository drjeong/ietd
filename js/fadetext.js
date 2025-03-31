<!-- This script and many more are available free online at -->
<!-- The JavaScript Source!! http://javascript.internet.com -->

<!-- Begin
// add as many or as few messages as you would like
var msg=new Array()
msg[0]='<CENTER>Optical Communication through Fiber Optic Devices</CENTER>';
msg[1]='<CENTER>You can see more information about optical networks ...</CENTER>';
msg[2]='<CENTER>...when you visit the Optelnet Co., Ltd.</CENTER>';
msg[3]='<CENTER>Just type in \'<A href=\'http://www.optelnet.com/\'>www.optelnet.com</A>\'</CENTER>';


// set your first set of colors.  Use as many or as few as you wish.
var colors1=new Array("ffffff", "eeeeff", "ddddff", "ccccff", "bbbbff", "aaaaff", "9999ff",
"8888ff", "7777ff", "6666ff", "5555ff", "4444ff", "3333ff","2222ff", "1111ff", "0000ff")

//set your second set of colors
// *** must have exactly the same number of colors as the array above ***
var colors2=new Array("ffffff", "ffeeee", "ffdddd", "ffcccc", "ffbbbb", "ffaaaa", "ff9999",
"ff8888", "ff7777", "ff6666", "ff5555", "ff4444", "ff3333", "ff2222", "ff1111", "ff0000")

//set the height of the display in pixels
high=60;

//set the width of the display in pixels
wide=350;

//set the pixel coordinates for the upper left hand corner of the display
Xpos=200;
Ypos=2;

// move the display away from the edges of the background
pad=15;

// set the background color of the display
bgcol="ffffff";

//add a background image if you want.
// *** for no image, just leave empty quotes (ex. cellbg=""; ) ***
cellbg="faderbg.jpg";

// set the font
fntFam="verdana,helvetica,arial";
fntSize=13;

// set how how many seconds you want the message to stay remain at totality.
pause=3.5;


// Do not edit these values below!!!

icolor=0;
mcolor=1;
imsg=0;
spWidth=wide-(2*pad);
totality=false;
glowing=true;
var theMsg="";
var cellcontent="";
pause=pause*1000;
if(cellbg.length>4){cellbg=" background="+cellbg}
else{cellbg="";}

function doPause(){
   totality=false; t=setTimeout("changecolor()",pause);
   }
function initiate(){
   getContentColor();
   getMsg();
   getCellContent();
   if(document.all){
   msgbg.innerHTML=cellcontent;
   msgfade.innerHTML=theMsg;
   msgbg.style.posLeft=Xpos;
   msgbg.style.posTop=Ypos;
   msgfade.style.posLeft=Xpos+pad;
   msgfade.style.posTop=Ypos+pad;
   t=setTimeout("changecolor()",50);}
   if(document.layers){
   document.msgbg.document.write(cellcontent);
   document.msgbg.document.close();
   document.msgfade.document.write(theMsg);
   document.msgfade.document.close();
   document.msgbg.left=Xpos;
   document.msgbg.top=Ypos;
   document.msgfade.left=Xpos+pad;
   document.msgfade.top=Ypos+pad;
   t=setTimeout("changecolor()",100);}
   }
function changecolor(){
   if(totality==true){doPause();}
   else{
   getMsg();
   getContentColor();
   if(document.all){
   msgfade.innerHTML=theMsg;
   t=setTimeout("changecolor()",50);}
   if(document.layers){
   document.msgfade.document.write(theMsg);
   document.msgfade.document.close();
   t=setTimeout("changecolor()",70);}
   }
   }
function getFadeColor(){
   icolor=icolor-1;
   if(mcolor==1){contentcolor=colors1[icolor];}
   else{contentcolor=colors2[icolor];}
   }
function getGlowColor(){
   icolor=icolor+1;
   if(mcolor==1){contentcolor=colors1[icolor];}
   else{contentcolor=colors2[icolor];}
   }
function changemsg(){
   if(imsg==msg.length-1){imsg=0; mcolor=1;}
   else if(imsg != msg.lenght-1 && mcolor==1){imsg=imsg+1; mcolor=0;}
   else{imsg=imsg+1; mcolor=1;}
   }
function getContentColor(){
   if(icolor==colors1.length-1 && glowing==true){
   getFadeColor(); glowing=false; totality=true;}
   else if(icolor < colors1.length && glowing==true){
   getGlowColor();}
   else if(icolor < 1 && glowing==false){changemsg(); getGlowColor(); glowing=true;}
   else{getFadeColor();}
   }
function getMsg() {
   theMsg="<span style='font-size:"+fntSize+"pt; font-family:"+fntFam+"; width:"+spWidth+";'>"
   theMsg+="<B><font color="+contentcolor+">"+msg[imsg]+"</font></B> "
   theMsg+="</span>"
   }
function getCellContent(){
   cellcontent="<TABLE height="+high+
   " width="+wide+" bgcolor="+bgcol+" cellpadding=0 cellspacing=0><TR><TD"+cellbg+"> </TD></TR></TABLE>"}
//  End -->

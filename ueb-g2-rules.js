// ueb-g2-rules.js — UEB Grade 2 規則資料（共用模組）
// braille-translate.htm 和 UEB-g2-query.html 共同引用
// 請勿直接修改此檔案中的點字資料；如需更新，從 braille-translate.htm 同步。

// ════════════════════════════════════════════════════════════
//  一、資料表
// ════════════════════════════════════════════════════════════

const G2_ALWAYS = {'and':'⠯','ar':'⠜','betws':'⠃⠑⠞⠺⠎','cannot':'⠸⠉','cch':'⠉⠡','ch':'⠡','character':'⠐⠡','day':'⠐⠙','ear':'⠑⠜','ed':'⠫','eever':'⠑⠑⠧⠻','encephal':'⠢⠉⠑⠏⠓⠁⠇','enough':'⠢⠳⠣','er':'⠻','ever':'⠐⠑','eversion':'⠑⠧⠻⠨⠝','evertebra':'⠑⠧⠻⠞⠑⠃⠗⠁','evertib':'⠑⠧⠻⠞⠊⠃','father':'⠐⠋','ffor':'⠋⠿','for':'⠿','gh':'⠣','had':'⠸⠓','here':'⠐⠓','hered':'⠓⠻⠫','herence':'⠓⠻⠰⠑','herencies':'⠓⠻⠢⠉⠊⠑⠎','herency':'⠓⠻⠢⠉⠽','herend':'⠓⠻⠢⠙','herent':'⠓⠻⠢⠞','herer':'⠓⠻⠻','honest':'⠓⠐⠕⠌','iever':'⠊⠑⠧⠻','know':'⠐⠅','lord':'⠐⠇','many':'⠸⠍','mention':'⠍⠢⠰⠝','monetary':'⠍⠐⠕⠞⠜⠽','mother':'⠐⠍','name':'⠐⠝','nament':'⠝⠁⠰⠞','of':'⠷','ofor':'⠕⠿','one':'⠐⠕','ou':'⠳','ought':'⠐⠳','ow':'⠪','owork':'⠕⠐⠺','part':'⠐⠏','phad':'⠏⠓⠁⠙','pineapple':'⠏⠔⠑⠁⠏⠏⠇⠑','question':'⠐⠟','reverb':'⠗⠑⠧⠻⠃','reversab':'⠗⠑⠧⠻⠎⠁⠃','reversib':'⠗⠑⠧⠻⠎⠊⠃','reversif':'⠗⠑⠧⠻⠎⠊⠋','right':'⠐⠗','severed':'⠎⠐⠑⠫','sh':'⠩','some':'⠐⠎','somever':'⠎⠕⠍⠐⠑','spirit':'⠸⠎','st':'⠌','th':'⠹','the':'⠮','their':'⠸⠮','these':'⠘⠮','through':'⠐⠹','time':'⠐⠞','timent':'⠞⠊⠰⠞','under':'⠐⠥','upon':'⠘⠥','vinedress':'⠧⠔⠑⠙⠗⠑⠎⠎','wh':'⠱','where':'⠐⠱','whose':'⠘⠱','with':'⠾','word':'⠘⠺','work':'⠐⠺','world':'⠸⠺','young':'⠐⠽','there':'⠐⠮','those':'⠘⠹'};

const G2_ANYWHERE = {'in':'⠔','en':'⠢'};

const G2_BEGWORD = {'con':'⠒','dis':'⠲','be':'⠆'};

const G2_MIDWORD = {'ea':'⠂','bb':'⠆','cc':'⠒','ff':'⠖','gg':'⠶'};

const G2_MIDEND = {'ing':'⠬','tion':'⠰⠝','ence':'⠰⠑','ance':'⠨⠑','ment':'⠰⠞','ness':'⠰⠎','ful':'⠰⠇','ity':'⠰⠽','ound':'⠨⠙','ount':'⠨⠞','sion':'⠨⠝','less':'⠨⠎','ong':'⠰⠛'};

const G2_LOWWORD = {'his':'⠦','was':'⠴','were':'⠶','enough':'⠢'};

const G2_SUFWORD = {'be':'⠆'};

// 例外詞：規則引擎無法自動推導，直接指定輸出（不屬於教學規則類別）
const G2_EXCEPTIONS = {
'aright':'⠁⠐⠗','arights':'⠁⠐⠗⠎',
'nowhere':'⠝⠕⠐⠱','nowheres':'⠝⠕⠐⠱⠎',
'heresy':'⠓⠻⠑⠎⠽','heresies':'⠓⠻⠑⠎⠊⠑⠎',
'heretic':'⠓⠻⠑⠞⠊⠉','heretics':'⠓⠻⠑⠞⠊⠉⠎','heretical':'⠓⠻⠑⠞⠊⠉⠁⠇','heretically':'⠓⠻⠑⠞⠊⠉⠁⠇⠇⠽',
'mistime':'⠍⠊⠎⠐⠞','mistimed':'⠍⠊⠎⠐⠞⠙','mistiming':'⠍⠊⠎⠐⠞⠬','mistimes':'⠍⠊⠎⠐⠞⠎',
'pastime':'⠏⠁⠎⠐⠞','pastimes':'⠏⠁⠎⠐⠞⠎',
'altimeter':'⠁⠇⠞⠊⠍⠑⠞⠻','altimeters':'⠁⠇⠞⠊⠍⠑⠞⠻⠎',
'asthma':'⠁⠎⠹⠍⠁','asthmas':'⠁⠎⠹⠍⠁⠎','asthmatic':'⠁⠎⠹⠍⠁⠞⠊⠉','asthmatics':'⠁⠎⠹⠍⠁⠞⠊⠉⠎',
'indiarubber':'⠔⠙⠊⠁⠗⠥⠆⠻','indiarubbers':'⠔⠙⠊⠁⠗⠥⠆⠻⠎',
'infrared':'⠔⠋⠗⠁⠗⠫','infrareds':'⠔⠋⠗⠁⠗⠫⠎',
'cation':'⠉⠁⠰⠝','cations':'⠉⠁⠰⠝⠎',
'centime':'⠉⠢⠐⠞','centimes':'⠉⠢⠐⠞⠎',
'bundestag':'⠃⠥⠝⠙⠑⠎⠞⠁⠛',
'blossomed':'⠃⠇⠕⠎⠎⠕⠍⠫',
'kwh':'⠅⠺⠓','kWh':'⠅⠠⠺⠓',
'panettone':'⠏⠁⠝⠑⠞⠞⠕⠝⠑','panettones':'⠏⠁⠝⠑⠞⠞⠕⠝⠑⠎',
'colonel':'⠉⠕⠇⠕⠝⠑⠇','colonels':'⠉⠕⠇⠕⠝⠑⠇⠎',
'severe':'⠎⠑⠧⠻⠑','severed':'⠎⠐⠑⠫','severely':'⠎⠑⠧⠻⠑⠇⠽','severer':'⠎⠑⠧⠻⠑⠗','severest':'⠎⠑⠧⠻⠑⠌',
'revere':'⠗⠑⠧⠻⠑','revered':'⠗⠑⠧⠻⠫','reveres':'⠗⠑⠧⠻⠑⠎','revering':'⠗⠑⠧⠻⠬',
'persevere':'⠏⠻⠎⠑⠧⠻⠑','persevered':'⠏⠻⠎⠑⠧⠻⠫','perseveres':'⠏⠻⠎⠑⠧⠻⠑⠎','persevering':'⠏⠻⠎⠑⠧⠻⠬',
'theses':'⠮⠎⠑⠎','thesis':'⠮⠎⠊⠎',
'dispirited':'⠙⠊⠸⠎⠫','dispiritedly':'⠙⠊⠸⠎⠫⠇⠽','dispiritedness':'⠙⠊⠸⠎⠫⠰⠎',
'dispiriting':'⠙⠊⠸⠎⠬',
'lathered':'⠇⠁⠮⠗⠫',
'beautifully':'⠃⠂⠥⠞⠊⠰⠇⠇⠽','beautify':'⠃⠂⠥⠞⠊⠋⠽','beautified':'⠃⠂⠥⠞⠊⠋⠊⠫','beautifying':'⠃⠂⠥⠞⠊⠋⠊⠬','beautifies':'⠃⠂⠥⠞⠊⠋⠊⠑⠎',
'lioness':'⠇⠊⠕⠰⠎','lionesses':'⠇⠊⠕⠰⠎⠑⠎',
'baroness':'⠃⠜⠕⠰⠎','baronesses':'⠃⠜⠕⠰⠎⠑⠎',
'viscountess':'⠧⠊⠎⠉⠨⠞⠰⠎','viscountesses':'⠧⠊⠎⠉⠨⠞⠰⠎⠑⠎',
'countess':'⠉⠨⠞⠰⠎','countesses':'⠉⠨⠞⠰⠎⠑⠎',
'renamed':'⠗⠑⠐⠝⠙','renames':'⠗⠑⠐⠝⠎','renaming':'⠗⠑⠐⠝⠬',
'filename':'⠋⠊⠇⠑⠐⠝','filenames':'⠋⠊⠇⠑⠐⠝⠎',
'mistimed':'⠍⠊⠎⠐⠞⠙','mistiming':'⠍⠊⠎⠐⠞⠬',
'understand':'⠐⠥⠌⠯','understands':'⠐⠥⠌⠯⠎','understood':'⠐⠥⠌⠕⠕⠙',
'understanding':'⠐⠥⠌⠯⠬','understandings':'⠐⠥⠌⠯⠬⠎','understandable':'⠐⠥⠌⠯⠁⠃⠇⠑',
'misunderstand':'⠍⠊⠎⠐⠥⠌⠯','misunderstood':'⠍⠊⠎⠐⠥⠌⠕⠕⠙',
};

// 整詞縮寫表：shortforms + wordsigns + initial-letter contractions
// （合併 G2_EXCEPTIONS 以保持查找順序：例外詞優先）
const G2_WORD = {
...G2_EXCEPTIONS,
'about':'⠁⠃','aboutface':'⠁⠃⠋⠁⠉⠑','aboutfaced':'⠁⠃⠋⠁⠉⠫','aboutfacer':'⠁⠃⠋⠁⠉⠻','aboutfacers':'⠁⠃⠋⠁⠉⠻⠎','aboutfaces':'⠁⠃⠋⠁⠉⠑⠎','aboutfacing':'⠁⠃⠋⠁⠉⠬','aboutfacings':'⠁⠃⠋⠁⠉⠬⠎','abouts':'⠁⠃⠳⠞⠎','aboutturn':'⠁⠃⠞⠥⠗⠝','aboutturned':'⠁⠃⠞⠥⠗⠝⠫','aboutturns':'⠁⠃⠞⠥⠗⠝⠎','above':'⠁⠃⠧','aboveboard':'⠁⠃⠧⠃⠕⠜⠙','aboveboards':'⠁⠃⠧⠃⠕⠜⠙⠎','aboveground':'⠁⠃⠧⠛⠗⠨⠙','abovegrounds':'⠁⠃⠧⠛⠗⠨⠙⠎','abovementioned':'⠁⠃⠧⠍⠢⠰⠝⠫','aboves':'⠁⠃⠧⠎','according':'⠁⠉','accordingly':'⠁⠉⠇⠽','accordings':'⠁⠉⠎','across':'⠁⠉⠗','acrosss':'⠁⠉⠗⠎','aforesaid':'⠁⠿⠑⠎⠙','aforesaids':'⠁⠿⠑⠎⠙⠎','after':'⠁⠋','afterbattle':'⠁⠋⠃⠁⠞⠞⠇⠑','afterbattles':'⠁⠋⠃⠁⠞⠞⠇⠑⠎','afterbirth':'⠁⠋⠃⠊⠗⠹','afterbirths':'⠁⠋⠃⠊⠗⠹⠎','afterbreakfast':'⠁⠋⠃⠗⠂⠅⠋⠁⠌','afterbreakfasts':'⠁⠋⠃⠗⠂⠅⠋⠁⠌⠎','afterburn':'⠁⠋⠃⠥⠗⠝','afterburned':'⠁⠋⠃⠥⠗⠝⠫','afterburner':'⠁⠋⠃⠥⠗⠝⠻','afterburners':'⠁⠋⠃⠥⠗⠝⠻⠎','afterburning':'⠁⠋⠃⠥⠗⠝⠬','afterburnings':'⠁⠋⠃⠥⠗⠝⠬⠎','afterburns':'⠁⠋⠃⠥⠗⠝⠎','aftercare':'⠁⠋⠉⠜⠑','aftercares':'⠁⠋⠉⠜⠑⠎','afterclap':'⠁⠋⠉⠇⠁⠏','afterclaps':'⠁⠋⠉⠇⠁⠏⠎','aftercoffee':'⠁⠋⠉⠷⠋⠑⠑','aftercoffees':'⠁⠋⠉⠷⠋⠑⠑⠎','afterdamp':'⠁⠋⠙⠁⠍⠏','afterdamps':'⠁⠋⠙⠁⠍⠏⠎','afterdark':'⠁⠋⠙⠜⠅','afterdarks':'⠁⠋⠙⠜⠅⠎','afterdeck':'⠁⠋⠙⠑⠉⠅','afterdecks':'⠁⠋⠙⠑⠉⠅⠎','afterdinner':'⠁⠋⠙⠔⠝⠻','afterdinners':'⠁⠋⠙⠔⠝⠻⠎','afterflow':'⠁⠋⠋⠇⠪','afterflows':'⠁⠋⠋⠇⠪⠎','aftergame':'⠁⠋⠛⠁⠍⠑','aftergames':'⠁⠋⠛⠁⠍⠑⠎','afterglow':'⠁⠋⠛⠇⠪','afterglows':'⠁⠋⠛⠇⠪⠎','afterguard':'⠁⠋⠛⠥⠜⠙','afterguards':'⠁⠋⠛⠥⠜⠙⠎','afterhatch':'⠁⠋⠓⠁⠞⠡','afterhatches':'⠁⠋⠓⠁⠞⠡⠑⠎','afterhatchess':'⠁⠋⠓⠁⠞⠡⠑⠎⠎','afterhatchs':'⠁⠋⠓⠁⠞⠡⠎','afterhour':'⠁⠋⠓⠳⠗','afterhours':'⠁⠋⠓⠳⠗⠎','afterlife':'⠁⠋⠇⠊⠋⠑','afterlifes':'⠁⠋⠇⠊⠋⠑⠎','afterlight':'⠁⠋⠇⠊⠣⠞','afterlights':'⠁⠋⠇⠊⠣⠞⠎','afterlives':'⠁⠋⠇⠊⠧⠑⠎','afterlivess':'⠁⠋⠇⠊⠧⠑⠎⠎','afterlunch':'⠁⠋⠇⠥⠝⠡','afterlunches':'⠁⠋⠇⠥⠝⠡⠑⠎','afterlunchess':'⠁⠋⠇⠥⠝⠡⠑⠎⠎','afterlunchs':'⠁⠋⠇⠥⠝⠡⠎','aftermarket':'⠁⠋⠍⠜⠅⠑⠞','aftermarkets':'⠁⠋⠍⠜⠅⠑⠞⠎','aftermatch':'⠁⠋⠍⠁⠞⠡','aftermatches':'⠁⠋⠍⠁⠞⠡⠑⠎','aftermatchs':'⠁⠋⠍⠁⠞⠡⠎','aftermath':'⠁⠋⠍⠁⠹','aftermaths':'⠁⠋⠍⠁⠹⠎','aftermeeting':'⠁⠋⠍⠑⠑⠞⠬','aftermeetings':'⠁⠋⠍⠑⠑⠞⠬⠎','aftermentioned':'⠁⠋⠍⠢⠰⠝⠫','aftermentioneds':'⠁⠋⠍⠢⠰⠝⠫⠎','aftermidday':'⠁⠋⠍⠊⠙⠐⠙','aftermiddays':'⠁⠋⠍⠊⠙⠐⠙⠎','aftermidnight':'⠁⠋⠍⠊⠙⠝⠊⠣⠞','aftermidnights':'⠁⠋⠍⠊⠙⠝⠊⠣⠞⠎','aftermost':'⠁⠋⠍⠕⠌','aftermosts':'⠁⠋⠍⠕⠌⠎','afternoon':'⠁⠋⠝','afternoons':'⠁⠋⠝⠎','afternoontea':'⠁⠋⠝⠞⠑⠁','afternoonteas':'⠁⠋⠝⠞⠑⠁⠎','afterpain':'⠁⠋⠏⠁⠔','afterpains':'⠁⠋⠏⠁⠔⠎','afterparties':'⠁⠋⠐⠏⠊⠑⠎','afterpartiess':'⠁⠋⠐⠏⠊⠑⠎⠎','afterparty':'⠁⠋⠐⠏⠽','afterpartys':'⠁⠋⠐⠏⠽⠎','afterpiece':'⠁⠋⠏⠊⠑⠉⠑','afterpieces':'⠁⠋⠏⠊⠑⠉⠑⠎','afterplay':'⠁⠋⠏⠇⠁⠽','afterplays':'⠁⠋⠏⠇⠁⠽⠎','afters':'⠁⠋⠎','aftersale':'⠁⠋⠎⠁⠇⠑','aftersales':'⠁⠋⠎⠁⠇⠑⠎','afterschool':'⠁⠋⠎⠡⠕⠕⠇','afterschools':'⠁⠋⠎⠡⠕⠕⠇⠎','aftersensation':'⠁⠋⠎⠢⠎⠁⠰⠝','aftersensations':'⠁⠋⠎⠢⠎⠁⠰⠝⠎','aftershave':'⠁⠋⠩⠁⠧⠑','aftershaves':'⠁⠋⠩⠁⠧⠑⠎','aftershock':'⠁⠋⠩⠕⠉⠅','aftershocks':'⠁⠋⠩⠕⠉⠅⠎','aftershow':'⠁⠋⠩⠪','aftershower':'⠁⠋⠩⠪⠻','aftershowers':'⠁⠋⠩⠪⠻⠎','aftershows':'⠁⠋⠩⠪⠎','aftersupper':'⠁⠋⠎⠥⠏⠏⠻','aftersuppers':'⠁⠋⠎⠥⠏⠏⠻⠎','aftertaste':'⠁⠋⠞⠁⠌⠑','aftertastes':'⠁⠋⠞⠁⠌⠑⠎','aftertax':'⠁⠋⠞⠁⠭','aftertaxes':'⠁⠋⠞⠁⠭⠑⠎','aftertaxess':'⠁⠋⠞⠁⠭⠑⠎⠎','aftertaxs':'⠁⠋⠞⠁⠭⠎','aftertea':'⠁⠋⠞⠑⠁','afterteas':'⠁⠋⠞⠑⠁⠎','aftertheater':'⠁⠋⠮⠁⠞⠻','aftertheaters':'⠁⠋⠮⠁⠞⠻⠎','aftertheatre':'⠁⠋⠮⠁⠞⠗⠑','aftertheatres':'⠁⠋⠮⠁⠞⠗⠑⠎','afterthought':'⠁⠋⠹⠐⠳','afterthoughts':'⠁⠋⠹⠐⠳⠎','aftertime':'⠁⠋⠐⠞','aftertimes':'⠁⠋⠐⠞⠎','aftertreatment':'⠁⠋⠞⠗⠂⠞⠰⠞','aftertreatments':'⠁⠋⠞⠗⠂⠞⠰⠞⠎','afterward':'⠁⠋⠺','afterwards':'⠁⠋⠺⠎','afterword':'⠁⠋⠘⠺','afterwords':'⠁⠋⠘⠺⠎','afterwork':'⠁⠋⠐⠺','afterworks':'⠁⠋⠐⠺⠎','afterworld':'⠁⠋⠸⠺','afterworlds':'⠁⠋⠸⠺⠎','again':'⠁⠛','agains':'⠁⠛⠎','against':'⠁⠛⠌','againsts':'⠁⠛⠌⠎','almost':'⠁⠇⠍','almosts':'⠁⠇⠍⠕⠌⠎','alms':'⠁⠇⠍⠎','already':'⠁⠇⠗','alreadys':'⠁⠇⠗⠎','also':'⠁⠇','alsos':'⠁⠇⠎','although':'⠁⠇⠹','althoughs':'⠁⠇⠹⠎','altogether':'⠁⠇⠞','altogethers':'⠁⠇⠞⠎','always':'⠁⠇⠺','alwayss':'⠁⠇⠺⠎','apperceive':'⠁⠏⠏⠻⠉⠧','apperceived':'⠁⠏⠏⠻⠉⠧⠙','apperceiver':'⠁⠏⠏⠻⠉⠧⠗','apperceivers':'⠁⠏⠏⠻⠉⠧⠗⠎','apperceives':'⠁⠏⠏⠻⠉⠧⠎','apperceiving':'⠁⠏⠏⠻⠉⠧⠛','apperceivings':'⠁⠏⠏⠻⠉⠧⠛⠎','archdeceiver':'⠜⠡⠙⠉⠧⠗','archdeceivers':'⠜⠡⠙⠉⠧⠗⠎','as':'⠵','beata':'⠆⠁⠞⠁','beatae':'⠆⠁⠞⠁⠑','beati':'⠆⠁⠞⠊','beatus':'⠆⠁⠞⠥⠎','because':'⠆⠉','becauses':'⠆⠉⠎','beche':'⠃⠑⠡⠑','beches':'⠃⠑⠡⠑⠎','bede':'⠃⠫⠑','beden':'⠃⠫⠢','bedes':'⠃⠫⠑⠎','before':'⠆⠋','beforehand':'⠆⠋⠓⠯','beforehands':'⠆⠋⠓⠯⠎','beforementioned':'⠆⠋⠍⠢⠰⠝⠫','beforementioneds':'⠆⠋⠍⠢⠰⠝⠫⠎','befores':'⠆⠋⠎','befriend':'⠆⠋⠗','befriends':'⠆⠋⠗⠎','behind':'⠆⠓','behindhand':'⠆⠓⠓⠯','behindhands':'⠆⠓⠓⠯⠎','behinds':'⠆⠓⠎','bein':'⠃⠑⠔','beins':'⠃⠑⠔⠎','belittle':'⠆⠇⠇','belittled':'⠆⠇⠇⠙','belittlement':'⠆⠇⠇⠰⠞','belittlements':'⠆⠇⠇⠰⠞⠎','belittler':'⠆⠇⠇⠗','belittlers':'⠆⠇⠇⠗⠎','belittles':'⠆⠇⠇⠎','below':'⠆⠇','belowdeck':'⠆⠇⠙⠑⠉⠅','belowdecks':'⠆⠇⠙⠑⠉⠅⠎','belowground':'⠆⠇⠛⠗⠨⠙','belowgrounds':'⠆⠇⠛⠗⠨⠙⠎','belowmentioned':'⠆⠇⠍⠢⠰⠝⠫','belows':'⠆⠇⠎','ben':'⠃⠢','benammi':'⠃⠢⠁⠍⠍⠊','beneath':'⠆⠝','beneathdeck':'⠆⠝⠙⠑⠉⠅','beneathdecks':'⠆⠝⠙⠑⠉⠅⠎','beneathground':'⠆⠝⠛⠗⠨⠙','beneathgrounds':'⠆⠝⠛⠗⠨⠙⠎','beneaths':'⠆⠝⠎','benefic':'⠆⠝⠑⠋⠊⠉','beside':'⠆⠎','besides':'⠆⠎⠎','best':'⠃⠑⠌','bested':'⠃⠑⠌⠫','bester':'⠃⠑⠌⠻','bestest':'⠃⠑⠌⠑⠌','besting':'⠃⠑⠌⠬','bestness':'⠃⠑⠌⠰⠎','besty':'⠃⠑⠌⠽','between':'⠆⠞','betweendeck':'⠆⠞⠙⠑⠉⠅','betweendecks':'⠆⠞⠙⠑⠉⠅⠎','betweens':'⠆⠞⠎','betweentime':'⠆⠞⠐⠞','betweentimes':'⠆⠞⠐⠞⠎','betweenwhile':'⠆⠞⠱⠊⠇⠑','betweenwhiles':'⠆⠞⠱⠊⠇⠑⠎','beyond':'⠆⠽','beyonds':'⠆⠽⠎','biscuity':'⠃⠊⠎⠉⠥⠊⠞⠽','blind':'⠃⠇','blindfish':'⠃⠇⠋⠊⠩','blindfishes':'⠃⠇⠋⠊⠩⠑⠎','blindfishess':'⠃⠇⠋⠊⠩⠑⠎⠎','blindfishs':'⠃⠇⠋⠊⠩⠎','blindfold':'⠃⠇⠋⠕⠇⠙','blindfolded':'⠃⠇⠋⠕⠇⠙⠫','blindfolder':'⠃⠇⠋⠕⠇⠙⠻','blindfolders':'⠃⠇⠋⠕⠇⠙⠻⠎','blindfolding':'⠃⠇⠋⠕⠇⠙⠬','blindfoldings':'⠃⠇⠋⠕⠇⠙⠬⠎','blindfolds':'⠃⠇⠋⠕⠇⠙⠎','blindly':'⠃⠇⠇⠽','blindlys':'⠃⠇⠇⠽⠎','blindman':'⠃⠇⠍⠁⠝','blindmans':'⠃⠇⠍⠁⠝⠎','blindmen':'⠃⠇⠍⠢','blindmens':'⠃⠇⠍⠢⠎','blindness':'⠃⠇⠰⠎','blindnesses':'⠃⠇⠰⠎⠑⠎','blindnessess':'⠃⠇⠰⠎⠑⠎⠎','blindnesss':'⠃⠇⠰⠎⠎','blinds':'⠃⠇⠎','blindside':'⠃⠇⠎⠊⠙⠑','blindsided':'⠃⠇⠎⠊⠙⠫','blindsider':'⠃⠇⠎⠊⠙⠻','blindsiders':'⠃⠇⠎⠊⠙⠻⠎','blindsides':'⠃⠇⠎⠊⠙⠑⠎','blindsiding':'⠃⠇⠎⠊⠙⠬','blindsidings':'⠃⠇⠎⠊⠙⠬⠎','blindsight':'⠃⠇⠎⠊⠣⠞','blindsights':'⠃⠇⠎⠊⠣⠞⠎','blindstories':'⠃⠇⠌⠕⠗⠊⠑⠎','blindstoriess':'⠃⠇⠌⠕⠗⠊⠑⠎⠎','blindstory':'⠃⠇⠌⠕⠗⠽','blindstorys':'⠃⠇⠌⠕⠗⠽⠎','blindworm':'⠃⠇⠺⠕⠗⠍','blindworms':'⠃⠇⠺⠕⠗⠍⠎','bloodletter':'⠃⠇⠕⠕⠙⠇⠗','bloodletters':'⠃⠇⠕⠕⠙⠇⠗⠎','boyfriend':'⠃⠕⠽⠋⠗','boyfriends':'⠃⠕⠽⠋⠗⠎','braille':'⠃⠗⠇','brailled':'⠃⠗⠇⠙','brailler':'⠃⠗⠇⠗','braillers':'⠃⠗⠇⠗⠎','brailles':'⠃⠗⠇⠎','braillewriter':'⠃⠗⠇⠺⠗⠊⠞⠻','braillewriters':'⠃⠗⠇⠺⠗⠊⠞⠻⠎','braillewriting':'⠃⠗⠇⠺⠗⠊⠞⠬','braillewritings':'⠃⠗⠇⠺⠗⠊⠞⠬⠎','brailley':'⠃⠗⠇⠽','brailleys':'⠃⠗⠇⠽⠎','brainchildren':'⠃⠗⠁⠔⠡⠝','brainchildrens':'⠃⠗⠁⠔⠡⠝⠎','but':'⠃','can':'⠉','chainletter':'⠡⠁⠔⠇⠗','chainletters':'⠡⠁⠔⠇⠗⠎','child':'⠡','children':'⠡⠝','childrens':'⠡⠝⠎','colorblind':'⠉⠕⠇⠕⠗⠃⠇','colorblindness':'⠉⠕⠇⠕⠗⠃⠇⠰⠎','colorblindnesses':'⠉⠕⠇⠕⠗⠃⠇⠰⠎⠑⠎','colorblindnessess':'⠉⠕⠇⠕⠗⠃⠇⠰⠎⠑⠎⠎','colorblindnesss':'⠉⠕⠇⠕⠗⠃⠇⠰⠎⠎','colorblinds':'⠉⠕⠇⠕⠗⠃⠇⠎','colourblind':'⠉⠕⠇⠳⠗⠃⠇','colourblindness':'⠉⠕⠇⠳⠗⠃⠇⠰⠎','colourblindnesses':'⠉⠕⠇⠳⠗⠃⠇⠰⠎⠑⠎','colourblindnessess':'⠉⠕⠇⠳⠗⠃⠇⠰⠎⠑⠎⠎','colourblindnesss':'⠉⠕⠇⠳⠗⠃⠇⠰⠎⠎','colourblinds':'⠉⠕⠇⠳⠗⠃⠇⠎','conceive':'⠒⠉⠧','conceived':'⠒⠉⠧⠙','conceiver':'⠒⠉⠧⠗','conceivers':'⠒⠉⠧⠗⠎','conceives':'⠒⠉⠧⠎','conceiving':'⠒⠉⠧⠛','conceivings':'⠒⠉⠧⠛⠎','could':'⠉⠙','coulda':'⠉⠙⠁','couldas':'⠉⠙⠁⠎','couldest':'⠉⠙⠑⠌','couldests':'⠉⠙⠑⠌⠎','coulds':'⠉⠙⠎','couldst':'⠉⠙⠌','couldsts':'⠉⠙⠌⠎','dacoity':'⠙⠁⠉⠕⠊⠞⠽','deafblind':'⠙⠂⠋⠃⠇','deafblindness':'⠙⠂⠋⠃⠇⠰⠎','deafblindnesses':'⠙⠂⠋⠃⠇⠰⠎⠑⠎','deafblindnessess':'⠙⠂⠋⠃⠇⠰⠎⠑⠎⠎','deafblindnesss':'⠙⠂⠋⠃⠇⠰⠎⠎','deafblinds':'⠙⠂⠋⠃⠇⠎','deceive':'⠙⠉⠧','deceived':'⠙⠉⠧⠙','deceiver':'⠙⠉⠧⠗','deceivers':'⠙⠉⠧⠗⠎','deceives':'⠙⠉⠧⠎','deceiving':'⠙⠉⠧⠛','deceivings':'⠙⠉⠧⠛⠎','declare':'⠙⠉⠇','declared':'⠙⠉⠇⠙','declarer':'⠙⠉⠇⠗','declarers':'⠙⠉⠇⠗⠎','declares':'⠙⠉⠇⠎','declaring':'⠙⠉⠇⠛','declarings':'⠙⠉⠇⠛⠎','defriend':'⠙⠑⠋⠗','defriends':'⠙⠑⠋⠗⠎','dish':'⠙⠊⠩','disher':'⠙⠊⠩⠻','dishers':'⠙⠊⠩⠻⠎','dishy':'⠙⠊⠩⠽','disulphide':'⠙⠊⠎⠥⠇⠏⠓⠊⠙⠑','do':'⠙','doublequick':'⠙⠳⠃⠇⠑⠟⠅','doublequicks':'⠙⠳⠃⠇⠑⠟⠅⠎','eastabout':'⠑⠁⠌⠁⠃','eastabouts':'⠑⠁⠌⠁⠃⠎','either':'⠑⠊','eithers':'⠑⠊⠎','erigone':'⠻⠊⠛⠕⠝⠑','every':'⠑','feelgood':'⠋⠑⠑⠇⠛⠙','feelgoods':'⠋⠑⠑⠇⠛⠙⠎','feetfirst':'⠋⠑⠑⠞⠋⠌','feetfirsts':'⠋⠑⠑⠞⠋⠌⠎','first':'⠋⠌','firstaid':'⠋⠌⠁⠊⠙','firstaider':'⠋⠌⠁⠊⠙⠻','firstaiders':'⠋⠌⠁⠊⠙⠻⠎','firstaids':'⠋⠌⠁⠊⠙⠎','firstborn':'⠋⠌⠃⠕⠗⠝','firstborns':'⠋⠌⠃⠕⠗⠝⠎','firstclass':'⠋⠌⠉⠇⠁⠎⠎','firstclasses':'⠋⠌⠉⠇⠁⠎⠎⠑⠎','firstclassess':'⠋⠌⠉⠇⠁⠎⠎⠑⠎⠎','firstclasss':'⠋⠌⠉⠇⠁⠎⠎⠎','firstday':'⠋⠌⠐⠙','firstdayer':'⠋⠌⠐⠙⠻','firstdayers':'⠋⠌⠐⠙⠻⠎','firstdays':'⠋⠌⠐⠙⠎','firstfruit':'⠋⠌⠋⠗⠥⠊⠞','firstfruiting':'⠋⠌⠋⠗⠥⠊⠞⠬','firstfruitings':'⠋⠌⠋⠗⠥⠊⠞⠬⠎','firstfruits':'⠋⠌⠋⠗⠥⠊⠞⠎','firstgeneration':'⠋⠌⠛⠢⠻⠁⠰⠝','firstgenerations':'⠋⠌⠛⠢⠻⠁⠰⠝⠎','firsthand':'⠋⠌⠓⠯','firsthanded':'⠋⠌⠓⠯⠫','firsthands':'⠋⠌⠓⠯⠎','firstling':'⠋⠌⠇⠬','firstlings':'⠋⠌⠇⠬⠎','firstly':'⠋⠌⠇⠽','firstlys':'⠋⠌⠇⠽⠎','firstness':'⠋⠌⠰⠎','firstnesss':'⠋⠌⠰⠎⠎','firstnight':'⠋⠌⠝⠊⠣⠞','firstnighter':'⠋⠌⠝⠊⠣⠞⠻','firstnighters':'⠋⠌⠝⠊⠣⠞⠻⠎','firstnights':'⠋⠌⠝⠊⠣⠞⠎','firstrate':'⠋⠌⠗⠁⠞⠑','firstrated':'⠋⠌⠗⠁⠞⠫','firstrates':'⠋⠌⠗⠁⠞⠑⠎','firstrating':'⠋⠌⠗⠁⠞⠬','firstratings':'⠋⠌⠗⠁⠞⠬⠎','firsts':'⠋⠌⠎','firststring':'⠋⠌⠌⠗⠬','firststrings':'⠋⠌⠌⠗⠬⠎','forasmuch':'⠿⠁⠎⠍⠡','forasmuchs':'⠿⠁⠎⠍⠡⠎','foresaid':'⠿⠑⠎⠙','foresaids':'⠿⠑⠎⠙⠎','fosterchildren':'⠋⠕⠌⠻⠡⠝','fosterchildrens':'⠋⠕⠌⠻⠡⠝⠎','friend':'⠋⠗','friendless':'⠋⠗⠨⠎','friendlessness':'⠋⠗⠨⠎⠰⠎','friendlessnesses':'⠋⠗⠨⠎⠰⠎⠑⠎','friendlessnessess':'⠋⠗⠨⠎⠰⠎⠑⠎⠎','friendlessnesss':'⠋⠗⠨⠎⠰⠎⠎','friendlesss':'⠋⠗⠨⠎⠎','friendlier':'⠋⠗⠇⠊⠻','friendliers':'⠋⠗⠇⠊⠻⠎','friendlies':'⠋⠗⠇⠊⠑⠎','friendliess':'⠋⠗⠇⠊⠑⠎⠎','friendliest':'⠋⠗⠇⠊⠑⠌','friendliests':'⠋⠗⠇⠊⠑⠌⠎','friendliness':'⠋⠗⠇⠊⠰⠎','friendlinesses':'⠋⠗⠇⠊⠰⠎⠑⠎','friendlinessess':'⠋⠗⠇⠊⠰⠎⠑⠎⠎','friendlinesss':'⠋⠗⠇⠊⠰⠎⠎','friendly':'⠋⠗⠇⠽','friendlys':'⠋⠗⠇⠽⠎','friends':'⠋⠗⠎','friendship':'⠋⠗⠩⠊⠏','friendships':'⠋⠗⠩⠊⠏⠎','from':'⠋','fruity':'⠋⠗⠥⠊⠞⠽','gaberones':'⠛⠁⠃⠻⠕⠝⠑⠎','gadabout':'⠛⠁⠙⠁⠃','gadabouts':'⠛⠁⠙⠁⠃⠎','gainsaid':'⠛⠁⠔⠎⠙','gainsaids':'⠛⠁⠔⠎⠙⠎','galfriend':'⠛⠁⠇⠋⠗','galfriends':'⠛⠁⠇⠋⠗⠎','gentlemanfriend':'⠛⠢⠞⠇⠑⠍⠁⠝⠋⠗','gentlemanfriends':'⠛⠢⠞⠇⠑⠍⠁⠝⠋⠗⠎','gentlemenfriends':'⠛⠢⠞⠇⠑⠍⠢⠋⠗⠎','gentlemenfriendss':'⠛⠢⠞⠇⠑⠍⠢⠋⠗⠎⠎','girlfriend':'⠛⠊⠗⠇⠋⠗','girlfriends':'⠛⠊⠗⠇⠋⠗⠎','go':'⠛','godchildren':'⠛⠕⠙⠡⠝','godchildrens':'⠛⠕⠙⠡⠝⠎','good':'⠛⠙','goodafternoon':'⠛⠙⠁⠋⠝','goodafternoons':'⠛⠙⠁⠋⠝⠎','goodby':'⠛⠙⠃⠽','goodbye':'⠛⠙⠃⠽⠑','goodbyeing':'⠛⠙⠃⠽⠑⠬','goodbyeings':'⠛⠙⠃⠽⠑⠬⠎','goodbyes':'⠛⠙⠃⠽⠑⠎','goodbying':'⠛⠙⠃⠽⠬','goodbyings':'⠛⠙⠃⠽⠬⠎','goodbys':'⠛⠙⠃⠽⠎','goodday':'⠛⠙⠐⠙','gooddays':'⠛⠙⠐⠙⠎','gooder':'⠛⠙⠻','gooders':'⠛⠙⠻⠎','goodest':'⠛⠙⠑⠌','goodests':'⠛⠙⠑⠌⠎','goodevening':'⠛⠙⠑⠧⠢⠬','goodevenings':'⠛⠙⠑⠧⠢⠬⠎','goodfellow':'⠛⠙⠋⠑⠇⠇⠪','goodfellows':'⠛⠙⠋⠑⠇⠇⠪⠎','goodfellowship':'⠛⠙⠋⠑⠇⠇⠪⠩⠊⠏','goodfellowships':'⠛⠙⠋⠑⠇⠇⠪⠩⠊⠏⠎','goodhearted':'⠛⠙⠓⠑⠜⠞⠫','goodheartedly':'⠛⠙⠓⠑⠜⠞⠫⠇⠽','goodheartedlys':'⠛⠙⠓⠑⠜⠞⠫⠇⠽⠎','goodheartedness':'⠛⠙⠓⠑⠜⠞⠫⠰⠎','goodheartednesss':'⠛⠙⠓⠑⠜⠞⠫⠰⠎⠎','goodhumor':'⠛⠙⠓⠥⠍⠕⠗','goodhumored':'⠛⠙⠓⠥⠍⠕⠗⠫','goodhumoredly':'⠛⠙⠓⠥⠍⠕⠗⠫⠇⠽','goodhumoredlys':'⠛⠙⠓⠥⠍⠕⠗⠫⠇⠽⠎','goodhumoredness':'⠛⠙⠓⠥⠍⠕⠗⠫⠰⠎','goodhumorednesses':'⠛⠙⠓⠥⠍⠕⠗⠫⠰⠎⠑⠎','goodhumorednessess':'⠛⠙⠓⠥⠍⠕⠗⠫⠰⠎⠑⠎⠎','goodhumorednesss':'⠛⠙⠓⠥⠍⠕⠗⠫⠰⠎⠎','goodhumors':'⠛⠙⠓⠥⠍⠕⠗⠎','goodhumour':'⠛⠙⠓⠥⠍⠳⠗','goodhumoured':'⠛⠙⠓⠥⠍⠳⠗⠫','goodhumouredly':'⠛⠙⠓⠥⠍⠳⠗⠫⠇⠽','goodhumouredlys':'⠛⠙⠓⠥⠍⠳⠗⠫⠇⠽⠎','goodhumouredness':'⠛⠙⠓⠥⠍⠳⠗⠫⠰⠎','goodhumourednesses':'⠛⠙⠓⠥⠍⠳⠗⠫⠰⠎⠑⠎','goodhumourednessess':'⠛⠙⠓⠥⠍⠳⠗⠫⠰⠎⠑⠎⠎','goodhumourednesss':'⠛⠙⠓⠥⠍⠳⠗⠫⠰⠎⠎','goodhumours':'⠛⠙⠓⠥⠍⠳⠗⠎','goodie':'⠛⠙⠊⠑','goodies':'⠛⠙⠊⠑⠎','goodish':'⠛⠙⠊⠩','goodishs':'⠛⠙⠊⠩⠎','goodlier':'⠛⠙⠇⠊⠻','goodliers':'⠛⠙⠇⠊⠻⠎','goodliest':'⠛⠙⠇⠊⠑⠌','goodliests':'⠛⠙⠇⠊⠑⠌⠎','goodliness':'⠛⠙⠇⠊⠰⠎','goodlinesss':'⠛⠙⠇⠊⠰⠎⠎','goodlook':'⠛⠙⠇⠕⠕⠅','goodlooker':'⠛⠙⠇⠕⠕⠅⠻','goodlookers':'⠛⠙⠇⠕⠕⠅⠻⠎','goodlooking':'⠛⠙⠇⠕⠕⠅⠬','goodlookings':'⠛⠙⠇⠕⠕⠅⠬⠎','goodlooks':'⠛⠙⠇⠕⠕⠅⠎','goodly':'⠛⠙⠇⠽','goodlys':'⠛⠙⠇⠽⠎','goodman':'⠛⠙⠍⠁⠝','goodmans':'⠛⠙⠍⠁⠝⠎','goodmen':'⠛⠙⠍⠢','goodmens':'⠛⠙⠍⠢⠎','goodmorning':'⠛⠙⠍⠕⠗⠝⠬','goodmornings':'⠛⠙⠍⠕⠗⠝⠬⠎','goodnature':'⠛⠙⠝⠁⠞⠥⠗⠑','goodnatured':'⠛⠙⠝⠁⠞⠥⠗⠫','goodnaturedly':'⠛⠙⠝⠁⠞⠥⠗⠫⠇⠽','goodnaturedlys':'⠛⠙⠝⠁⠞⠥⠗⠫⠇⠽⠎','goodnaturedness':'⠛⠙⠝⠁⠞⠥⠗⠫⠰⠎','goodnaturednesss':'⠛⠙⠝⠁⠞⠥⠗⠫⠰⠎⠎','goodnatures':'⠛⠙⠝⠁⠞⠥⠗⠑⠎','goodness':'⠛⠙⠰⠎','goodnesses':'⠛⠙⠰⠎⠑⠎','goodnessess':'⠛⠙⠰⠎⠑⠎⠎','goodnesss':'⠛⠙⠰⠎⠎','goodnight':'⠛⠙⠝⠊⠣⠞','goodnights':'⠛⠙⠝⠊⠣⠞⠎','goods':'⠛⠙⠎','goodsize':'⠛⠙⠎⠊⠵⠑','goodsized':'⠛⠙⠎⠊⠵⠫','goodsizes':'⠛⠙⠎⠊⠵⠑⠎','goodtempered':'⠛⠙⠞⠑⠍⠏⠻⠫','goodtemperedly':'⠛⠙⠞⠑⠍⠏⠻⠫⠇⠽','goodtemperedlys':'⠛⠙⠞⠑⠍⠏⠻⠫⠇⠽⠎','goodtime':'⠛⠙⠐⠞','goodtimes':'⠛⠙⠐⠞⠎','goodun':'⠛⠙⠥⠝','gooduns':'⠛⠙⠥⠝⠎','goodwife':'⠛⠙⠺⠊⠋⠑','goodwifes':'⠛⠙⠺⠊⠋⠑⠎','goodwill':'⠛⠙⠺⠊⠇⠇','goodwilled':'⠛⠙⠺⠊⠇⠇⠫','goodwills':'⠛⠙⠺⠊⠇⠇⠎','goodwives':'⠛⠙⠺⠊⠧⠑⠎','goodwivess':'⠛⠙⠺⠊⠧⠑⠎⠎','goody':'⠛⠙⠽','goodyear':'⠛⠙⠽⠑⠜','goodyears':'⠛⠙⠽⠑⠜⠎','goodys':'⠛⠙⠽⠎','grandchildren':'⠛⠗⠯⠡⠝','grandchildrens':'⠛⠗⠯⠡⠝⠎','great':'⠛⠗⠞','greataunt':'⠛⠗⠞⠁⠥⠝⠞','greataunts':'⠛⠗⠞⠁⠥⠝⠞⠎','greatbatch':'⠛⠗⠞⠃⠁⠞⠡','greatbatchs':'⠛⠗⠞⠃⠁⠞⠡⠎','greatcircle':'⠛⠗⠞⠉⠊⠗⠉⠇⠑','greatcircles':'⠛⠗⠞⠉⠊⠗⠉⠇⠑⠎','greatcoat':'⠛⠗⠞⠉⠕⠁⠞','greatcoats':'⠛⠗⠞⠉⠕⠁⠞⠎','greaten':'⠛⠗⠞⠢','greatened':'⠛⠗⠞⠢⠫','greatener':'⠛⠗⠞⠢⠻','greateners':'⠛⠗⠞⠢⠻⠎','greatening':'⠛⠗⠞⠢⠬','greatenings':'⠛⠗⠞⠢⠬⠎','greatens':'⠛⠗⠞⠢⠎','greater':'⠛⠗⠞⠻','greaters':'⠛⠗⠞⠻⠎','greatest':'⠛⠗⠞⠑⠌','greatests':'⠛⠗⠞⠑⠌⠎','greatgrandaunt':'⠛⠗⠞⠛⠗⠯⠁⠥⠝⠞','greatgrandaunts':'⠛⠗⠞⠛⠗⠯⠁⠥⠝⠞⠎','greatgrandchild':'⠛⠗⠞⠛⠗⠯⠡⠊⠇⠙','greatgrandchildren':'⠛⠗⠞⠛⠗⠯⠡⠝','greatgrandchildrens':'⠛⠗⠞⠛⠗⠯⠡⠝⠎','greatgrandchilds':'⠛⠗⠞⠛⠗⠯⠡⠊⠇⠙⠎','greatgranddad':'⠛⠗⠞⠛⠗⠯⠙⠁⠙','greatgranddads':'⠛⠗⠞⠛⠗⠯⠙⠁⠙⠎','greatgranddaughter':'⠛⠗⠞⠛⠗⠯⠙⠁⠥⠣⠞⠻','greatgranddaughters':'⠛⠗⠞⠛⠗⠯⠙⠁⠥⠣⠞⠻⠎','greatgrandfather':'⠛⠗⠞⠛⠗⠯⠐⠋','greatgrandfatherhood':'⠛⠗⠞⠛⠗⠯⠐⠋⠓⠕⠕⠙','greatgrandfatherhoods':'⠛⠗⠞⠛⠗⠯⠐⠋⠓⠕⠕⠙⠎','greatgrandfathers':'⠛⠗⠞⠛⠗⠯⠐⠋⠎','greatgrandma':'⠛⠗⠞⠛⠗⠯⠍⠁','greatgrandmas':'⠛⠗⠞⠛⠗⠯⠍⠁⠎','greatgrandmother':'⠛⠗⠞⠛⠗⠯⠐⠍','greatgrandmotherhood':'⠛⠗⠞⠛⠗⠯⠐⠍⠓⠕⠕⠙','greatgrandmotherhoods':'⠛⠗⠞⠛⠗⠯⠐⠍⠓⠕⠕⠙⠎','greatgrandmothers':'⠛⠗⠞⠛⠗⠯⠐⠍⠎','greatgrandnephew':'⠛⠗⠞⠛⠗⠯⠝⠑⠏⠓⠑⠺','greatgrandnephews':'⠛⠗⠞⠛⠗⠯⠝⠑⠏⠓⠑⠺⠎','greatgrandniece':'⠛⠗⠞⠛⠗⠯⠝⠊⠑⠉⠑','greatgrandnieces':'⠛⠗⠞⠛⠗⠯⠝⠊⠑⠉⠑⠎','greatgrandpa':'⠛⠗⠞⠛⠗⠯⠏⠁','greatgrandparent':'⠛⠗⠞⠛⠗⠯⠏⠜⠢⠞','greatgrandparenthood':'⠛⠗⠞⠛⠗⠯⠏⠜⠢⠞⠓⠕⠕⠙','greatgrandparenthoods':'⠛⠗⠞⠛⠗⠯⠏⠜⠢⠞⠓⠕⠕⠙⠎','greatgrandparents':'⠛⠗⠞⠛⠗⠯⠏⠜⠢⠞⠎','greatgrandpas':'⠛⠗⠞⠛⠗⠯⠏⠁⠎','greatgrandson':'⠛⠗⠞⠛⠗⠯⠎⠕⠝','greatgrandsons':'⠛⠗⠞⠛⠗⠯⠎⠕⠝⠎','greatgranduncle':'⠛⠗⠞⠛⠗⠯⠥⠝⠉⠇⠑','greatgranduncles':'⠛⠗⠞⠛⠗⠯⠥⠝⠉⠇⠑⠎','greathearted':'⠛⠗⠞⠓⠑⠜⠞⠫','greatheartedly':'⠛⠗⠞⠓⠑⠜⠞⠫⠇⠽','greatheartedlys':'⠛⠗⠞⠓⠑⠜⠞⠫⠇⠽⠎','greatheartedness':'⠛⠗⠞⠓⠑⠜⠞⠫⠰⠎','greatheartednesses':'⠛⠗⠞⠓⠑⠜⠞⠫⠰⠎⠑⠎','greatheartednessess':'⠛⠗⠞⠓⠑⠜⠞⠫⠰⠎⠑⠎⠎','greatheartednesss':'⠛⠗⠞⠓⠑⠜⠞⠫⠰⠎⠎','greatly':'⠛⠗⠞⠇⠽','greatlys':'⠛⠗⠞⠇⠽⠎','greatnephew':'⠛⠗⠞⠝⠑⠏⠓⠑⠺','greatnephews':'⠛⠗⠞⠝⠑⠏⠓⠑⠺⠎','greatness':'⠛⠗⠞⠰⠎','greatnesses':'⠛⠗⠞⠰⠎⠑⠎','greatnessess':'⠛⠗⠞⠰⠎⠑⠎⠎','greatnesss':'⠛⠗⠞⠰⠎⠎','greatniece':'⠛⠗⠞⠝⠊⠑⠉⠑','greatnieces':'⠛⠗⠞⠝⠊⠑⠉⠑⠎','greats':'⠛⠗⠞⠎','greatsword':'⠛⠗⠞⠎⠘⠺','greatswords':'⠛⠗⠞⠎⠘⠺⠎','greatuncle':'⠛⠗⠞⠥⠝⠉⠇⠑','greatuncles':'⠛⠗⠞⠥⠝⠉⠇⠑⠎','guyfriend':'⠛⠥⠽⠋⠗','guyfriends':'⠛⠥⠽⠋⠗⠎','hateletter':'⠓⠁⠞⠑⠇⠗','hateletters':'⠓⠁⠞⠑⠇⠗⠎','have':'⠓','headfirst':'⠓⠂⠙⠋⠌','headfirsts':'⠓⠂⠙⠋⠌⠎','hereabout':'⠐⠓⠁⠃','hereabouts':'⠐⠓⠁⠃⠎','hereafter':'⠐⠓⠁⠋','hereafters':'⠐⠓⠁⠋⠎','hereagain':'⠐⠓⠁⠛','hereagains':'⠐⠓⠁⠛⠎','hereagainst':'⠐⠓⠁⠛⠌','hereagainsts':'⠐⠓⠁⠛⠌⠎','hereinabove':'⠐⠓⠔⠁⠃⠧','hereinaboves':'⠐⠓⠔⠁⠃⠧⠎','hereinafter':'⠐⠓⠔⠁⠋','hereinafters':'⠐⠓⠔⠁⠋⠎','hereinagain':'⠐⠓⠔⠁⠛','hereinagains':'⠐⠓⠔⠁⠛⠎','herself':'⠓⠻⠋','herselfs':'⠓⠻⠋⠎','highlypaid':'⠓⠊⠣⠇⠽⠏⠙','highlypaids':'⠓⠊⠣⠇⠽⠏⠙⠎','him':'⠓⠍','himbo':'⠓⠍⠃⠕','himboes':'⠓⠍⠃⠕⠑⠎','himboess':'⠓⠍⠃⠕⠑⠎⠎','himbos':'⠓⠍⠃⠕⠎','hims':'⠓⠊⠍⠎','himself':'⠓⠍⠋','himselfs':'⠓⠍⠋⠎','illpaid':'⠊⠇⠇⠏⠙','illpaids':'⠊⠇⠇⠏⠙⠎','immediate':'⠊⠍⠍','immediately':'⠊⠍⠍⠇⠽','immediatelys':'⠊⠍⠍⠇⠽⠎','immediateness':'⠊⠍⠍⠰⠎','immediatenesss':'⠊⠍⠍⠰⠎⠎','immediates':'⠊⠍⠍⠎','inasmuch':'⠔⠁⠎⠍⠡','inasmuchs':'⠔⠁⠎⠍⠡⠎','insomuch':'⠔⠎⠕⠍⠡','insomuchs':'⠔⠎⠕⠍⠡⠎','it':'⠭','its':'⠭⠎','itself':'⠭⠋','itselfs':'⠭⠋⠎','itss':'⠭⠎⠎','just':'⠚','knockabout':'⠅⠝⠕⠉⠅⠁⠃','knockabouts':'⠅⠝⠕⠉⠅⠁⠃⠎','knowledge':'⠅','ladyfriend':'⠇⠁⠙⠽⠋⠗','ladyfriends':'⠇⠁⠙⠽⠋⠗⠎','layabout':'⠇⠁⠽⠁⠃','layabouts':'⠇⠁⠽⠁⠃⠎','leann':'⠇⠑⠁⠝⠝','leanne':'⠇⠑⠁⠝⠝⠑','letter':'⠇⠗','letterbodies':'⠇⠗⠃⠕⠙⠊⠑⠎','letterbodiess':'⠇⠗⠃⠕⠙⠊⠑⠎⠎','letterbody':'⠇⠗⠃⠕⠙⠽','letterbodys':'⠇⠗⠃⠕⠙⠽⠎','letterbomb':'⠇⠗⠃⠕⠍⠃','letterbombed':'⠇⠗⠃⠕⠍⠃⠫','letterbomber':'⠇⠗⠃⠕⠍⠃⠻','letterbombers':'⠇⠗⠃⠕⠍⠃⠻⠎','letterbombing':'⠇⠗⠃⠕⠍⠃⠬','letterbombings':'⠇⠗⠃⠕⠍⠃⠬⠎','letterbombs':'⠇⠗⠃⠕⠍⠃⠎','letterbox':'⠇⠗⠃⠕⠭','letterboxed':'⠇⠗⠃⠕⠭⠫','letterboxer':'⠇⠗⠃⠕⠭⠻','letterboxers':'⠇⠗⠃⠕⠭⠻⠎','letterboxes':'⠇⠗⠃⠕⠭⠑⠎','letterboxess':'⠇⠗⠃⠕⠭⠑⠎⠎','letterboxing':'⠇⠗⠃⠕⠭⠬','letterboxings':'⠇⠗⠃⠕⠭⠬⠎','letterboxs':'⠇⠗⠃⠕⠭⠎','lettered':'⠇⠗⠫','letterer':'⠇⠗⠻','letterers':'⠇⠗⠻⠎','letterform':'⠇⠗⠿⠍','letterforms':'⠇⠗⠿⠍⠎','letterhead':'⠇⠗⠓⠂⠙','letterheading':'⠇⠗⠓⠂⠙⠬','letterheadings':'⠇⠗⠓⠂⠙⠬⠎','letterheads':'⠇⠗⠓⠂⠙⠎','lettering':'⠇⠗⠬','letterings':'⠇⠗⠬⠎','letterman':'⠇⠗⠍⠁⠝','lettermans':'⠇⠗⠍⠁⠝⠎','lettermen':'⠇⠗⠍⠢','lettermens':'⠇⠗⠍⠢⠎','letteropener':'⠇⠗⠕⠏⠢⠻','letteropeners':'⠇⠗⠕⠏⠢⠻⠎','letterperfect':'⠇⠗⠏⠻⠋⠑⠉⠞','letterperfects':'⠇⠗⠏⠻⠋⠑⠉⠞⠎','letterpress':'⠇⠗⠏⠗⠑⠎⠎','letterpressed':'⠇⠗⠏⠗⠑⠎⠎⠫','letterpresses':'⠇⠗⠏⠗⠑⠎⠎⠑⠎','letterpressess':'⠇⠗⠏⠗⠑⠎⠎⠑⠎⠎','letterpressing':'⠇⠗⠏⠗⠑⠎⠎⠬','letterpressings':'⠇⠗⠏⠗⠑⠎⠎⠬⠎','letterpresss':'⠇⠗⠏⠗⠑⠎⠎⠎','letterquality':'⠇⠗⠟⠥⠁⠇⠰⠽','letterqualitys':'⠇⠗⠟⠥⠁⠇⠰⠽⠎','letters':'⠇⠗⠎','letterspace':'⠇⠗⠎⠏⠁⠉⠑','letterspaced':'⠇⠗⠎⠏⠁⠉⠫','letterspaces':'⠇⠗⠎⠏⠁⠉⠑⠎','letterspacing':'⠇⠗⠎⠏⠁⠉⠬','letterspacings':'⠇⠗⠎⠏⠁⠉⠬⠎','lettertext':'⠇⠗⠞⠑⠭⠞','lettertexts':'⠇⠗⠞⠑⠭⠞⠎','like':'⠇','little':'⠇⠇','littled':'⠇⠇⠙','littleneck':'⠇⠇⠝⠑⠉⠅','littlenecks':'⠇⠇⠝⠑⠉⠅⠎','littleness':'⠇⠇⠰⠎','littlenesses':'⠇⠇⠰⠎⠑⠎','littlenessess':'⠇⠇⠰⠎⠑⠎⠎','littlenesss':'⠇⠇⠰⠎⠎','littler':'⠇⠇⠗','littlers':'⠇⠇⠗⠎','littles':'⠇⠇⠎','littlest':'⠇⠇⠌','littlests':'⠇⠇⠌⠎','lovechildren':'⠇⠕⠧⠑⠡⠝','lovechildrens':'⠇⠕⠧⠑⠡⠝⠎','loveletter':'⠇⠕⠧⠑⠇⠗','loveletters':'⠇⠕⠧⠑⠇⠗⠎','lowlypaid':'⠇⠪⠇⠽⠏⠙','lowlypaids':'⠇⠪⠇⠽⠏⠙⠎','manfriend':'⠍⠁⠝⠋⠗','manfriends':'⠍⠁⠝⠋⠗⠎','menfriends':'⠍⠢⠋⠗⠎','menfriendss':'⠍⠢⠋⠗⠎⠎','midafternoon':'⠍⠊⠙⠁⠋⠝','midafternoons':'⠍⠊⠙⠁⠋⠝⠎','misbraille':'⠍⠊⠎⠃⠗⠇','misbrailled':'⠍⠊⠎⠃⠗⠇⠙','misbrailles':'⠍⠊⠎⠃⠗⠇⠎','misperceive':'⠍⠊⠎⠏⠻⠉⠧','misperceived':'⠍⠊⠎⠏⠻⠉⠧⠙','misperceiver':'⠍⠊⠎⠏⠻⠉⠧⠗','misperceivers':'⠍⠊⠎⠏⠻⠉⠧⠗⠎','misperceives':'⠍⠊⠎⠏⠻⠉⠧⠎','misperceiving':'⠍⠊⠎⠏⠻⠉⠧⠛','misperceivings':'⠍⠊⠎⠏⠻⠉⠧⠛⠎','missaid':'⠍⠊⠎⠎⠙','missaids':'⠍⠊⠎⠎⠙⠎','moneth':'⠍⠕⠝⠑⠹','more':'⠍','morningafter':'⠍⠕⠗⠝⠬⠁⠋','morningafters':'⠍⠕⠗⠝⠬⠁⠋⠎','much':'⠍⠡','muchly':'⠍⠡⠇⠽','muchlys':'⠍⠡⠇⠽⠎','muchness':'⠍⠡⠰⠎','muchnesss':'⠍⠡⠰⠎⠎','muchs':'⠍⠡⠎','must':'⠍⠌','musta':'⠍⠌⠁','mustard':'⠍⠌⠜⠙','mustards':'⠍⠌⠜⠙⠎','mustardy':'⠍⠌⠜⠙⠽','mustardys':'⠍⠌⠜⠙⠽⠎','mustas':'⠍⠌⠁⠎','mustier':'⠍⠌⠊⠻','mustiers':'⠍⠌⠊⠻⠎','mustiest':'⠍⠌⠊⠑⠌','mustiests':'⠍⠌⠊⠑⠌⠎','mustily':'⠍⠌⠊⠇⠽','mustilys':'⠍⠌⠊⠇⠽⠎','mustiness':'⠍⠌⠊⠰⠎','mustinesss':'⠍⠌⠊⠰⠎⠎','musts':'⠍⠌⠎','musty':'⠍⠌⠽','mustys':'⠍⠌⠽⠎','myself':'⠍⠽⠋','myselfs':'⠍⠽⠋⠎','necessary':'⠝⠑⠉','necessarys':'⠝⠑⠉⠎','neither':'⠝⠑⠊','neithers':'⠝⠑⠊⠎','nevers':'⠝⠑⠧⠻⠎','newsletter':'⠝⠑⠺⠎⠇⠗','newsletters':'⠝⠑⠺⠎⠇⠗⠎','none':'⠝⠐⠕','nones':'⠝⠐⠕⠎','nonesuch':'⠝⠐⠕⠎⠡','nonesuchs':'⠝⠐⠕⠎⠡⠎','nonsuch':'⠝⠕⠝⠎⠡','nonsuchs':'⠝⠕⠝⠎⠡⠎','northabout':'⠝⠕⠗⠹⠁⠃','northabouts':'⠝⠕⠗⠹⠁⠃⠎','not':'⠝','oneself':'⠐⠕⠋','oneselfs':'⠐⠕⠋⠎','ourselves':'⠳⠗⠧⠎','ourselvess':'⠳⠗⠧⠎⠎','out':'⠳','overmuch':'⠕⠧⠻⠍⠡','overmuchs':'⠕⠧⠻⠍⠡⠎','overpaid':'⠕⠧⠻⠏⠙','overpaids':'⠕⠧⠻⠏⠙⠎','paid':'⠏⠙','paids':'⠏⠙⠎','penfriend':'⠏⠢⠋⠗','penfriends':'⠏⠢⠋⠗⠎','pensione':'⠏⠢⠎⠊⠕⠝⠑','pensiones':'⠏⠢⠎⠊⠕⠝⠑⠎','people':'⠏','perceive':'⠏⠻⠉⠧','perceived':'⠏⠻⠉⠧⠙','perceiver':'⠏⠻⠉⠧⠗','perceivers':'⠏⠻⠉⠧⠗⠎','perceives':'⠏⠻⠉⠧⠎','perceiving':'⠏⠻⠉⠧⠛','perceivings':'⠏⠻⠉⠧⠛⠎','perhaps':'⠏⠻⠓','perhapses':'⠏⠻⠓⠑⠎','perhapsess':'⠏⠻⠓⠑⠎⠎','perhapss':'⠏⠻⠓⠎','pheres':'⠏⠓⠻⠑⠎','pityard':'⠏⠊⠞⠽⠜⠙','poorlypaid':'⠏⠕⠕⠗⠇⠽⠏⠙','poorlypaids':'⠏⠕⠕⠗⠇⠽⠏⠙⠎','postpaid':'⠏⠕⠌⠏⠙','postpaids':'⠏⠕⠌⠏⠙⠎','preceive':'⠏⠗⠉⠧','preceiver':'⠏⠗⠉⠧⠗','preceivers':'⠏⠗⠉⠧⠗⠎','preceives':'⠏⠗⠉⠧⠎','preceiving':'⠏⠗⠉⠧⠛','preceivings':'⠏⠗⠉⠧⠛⠎','prepaid':'⠏⠗⠑⠏⠙','prepaids':'⠏⠗⠑⠏⠙⠎','purblind':'⠏⠥⠗⠃⠇','purblindly':'⠏⠥⠗⠃⠇⠇⠽','purblindlys':'⠏⠥⠗⠃⠇⠇⠽⠎','purblindness':'⠏⠥⠗⠃⠇⠰⠎','purblindnesses':'⠏⠥⠗⠃⠇⠰⠎⠑⠎','purblindnessess':'⠏⠥⠗⠃⠇⠰⠎⠑⠎⠎','purblindnesss':'⠏⠥⠗⠃⠇⠰⠎⠎','purblinds':'⠏⠥⠗⠃⠇⠎','quick':'⠟⠅','quickdraw':'⠟⠅⠙⠗⠁⠺','quickdraws':'⠟⠅⠙⠗⠁⠺⠎','quicken':'⠟⠅⠢','quickened':'⠟⠅⠢⠫','quickener':'⠟⠅⠢⠻','quickeners':'⠟⠅⠢⠻⠎','quickening':'⠟⠅⠢⠬','quickenings':'⠟⠅⠢⠬⠎','quickens':'⠟⠅⠢⠎','quicker':'⠟⠅⠻','quickers':'⠟⠅⠻⠎','quickest':'⠟⠅⠑⠌','quickests':'⠟⠅⠑⠌⠎','quickfire':'⠟⠅⠋⠊⠗⠑','quickfires':'⠟⠅⠋⠊⠗⠑⠎','quickfiring':'⠟⠅⠋⠊⠗⠬','quickfirings':'⠟⠅⠋⠊⠗⠬⠎','quickfreeze':'⠟⠅⠋⠗⠑⠑⠵⠑','quickfreezes':'⠟⠅⠋⠗⠑⠑⠵⠑⠎','quickfreezing':'⠟⠅⠋⠗⠑⠑⠵⠬','quickfreezings':'⠟⠅⠋⠗⠑⠑⠵⠬⠎','quickfroze':'⠟⠅⠋⠗⠕⠵⠑','quickfrozen':'⠟⠅⠋⠗⠕⠵⠢','quickfrozens':'⠟⠅⠋⠗⠕⠵⠢⠎','quickfrozes':'⠟⠅⠋⠗⠕⠵⠑⠎','quickie':'⠟⠅⠊⠑','quickies':'⠟⠅⠊⠑⠎','quickish':'⠟⠅⠊⠩','quickishly':'⠟⠅⠊⠩⠇⠽','quickishlys':'⠟⠅⠊⠩⠇⠽⠎','quickishs':'⠟⠅⠊⠩⠎','quicklime':'⠟⠅⠇⠊⠍⠑','quicklimes':'⠟⠅⠇⠊⠍⠑⠎','quickly':'⠟⠅⠇⠽','quicklys':'⠟⠅⠇⠽⠎','quickness':'⠟⠅⠰⠎','quicknesses':'⠟⠅⠰⠎⠑⠎','quicknessess':'⠟⠅⠰⠎⠑⠎⠎','quicknesss':'⠟⠅⠰⠎⠎','quicks':'⠟⠅⠎','quicksand':'⠟⠅⠎⠯','quicksands':'⠟⠅⠎⠯⠎','quickset':'⠟⠅⠎⠑⠞','quicksets':'⠟⠅⠎⠑⠞⠎','quicksilver':'⠟⠅⠎⠊⠇⠧⠻','quicksilvered':'⠟⠅⠎⠊⠇⠧⠻⠫','quicksilvering':'⠟⠅⠎⠊⠇⠧⠻⠬','quicksilverings':'⠟⠅⠎⠊⠇⠧⠻⠬⠎','quicksilvers':'⠟⠅⠎⠊⠇⠧⠻⠎','quicksnap':'⠟⠅⠎⠝⠁⠏','quicksnaps':'⠟⠅⠎⠝⠁⠏⠎','quickstep':'⠟⠅⠌⠑⠏','quickstepped':'⠟⠅⠌⠑⠏⠏⠫','quickstepper':'⠟⠅⠌⠑⠏⠏⠻','quicksteppers':'⠟⠅⠌⠑⠏⠏⠻⠎','quickstepping':'⠟⠅⠌⠑⠏⠏⠬','quicksteppings':'⠟⠅⠌⠑⠏⠏⠬⠎','quicksteps':'⠟⠅⠌⠑⠏⠎','quicktempered':'⠟⠅⠞⠑⠍⠏⠻⠫','quicktime':'⠟⠅⠐⠞','quicktimes':'⠟⠅⠐⠞⠎','quickwitted':'⠟⠅⠺⠊⠞⠞⠫','quickwittedly':'⠟⠅⠺⠊⠞⠞⠫⠇⠽','quickwittedlys':'⠟⠅⠺⠊⠞⠞⠫⠇⠽⠎','quickwittedness':'⠟⠅⠺⠊⠞⠞⠫⠰⠎','quickwittednesss':'⠟⠅⠺⠊⠞⠞⠫⠰⠎⠎','quicky':'⠟⠅⠽','quickys':'⠟⠅⠽⠎','quite':'⠟','rabbity':'⠗⠁⠆⠊⠞⠽','rared':'⠗⠁⠗⠫','rather':'⠗','readacross':'⠗⠂⠙⠁⠉⠗','readacrosss':'⠗⠂⠙⠁⠉⠗⠎','readme':'⠗⠂⠙⠍⠑','readmes':'⠗⠂⠙⠍⠑⠎','reave':'⠗⠂⠧⠑','reaved':'⠗⠂⠧⠫','reaves':'⠗⠂⠧⠑⠎','reaving':'⠗⠂⠧⠬','rebraille':'⠗⠑⠃⠗⠇','rebrailled':'⠗⠑⠃⠗⠇⠙','rebrailler':'⠗⠑⠃⠗⠇⠗','rebraillers':'⠗⠑⠃⠗⠇⠗⠎','rebrailles':'⠗⠑⠃⠗⠇⠎','receive':'⠗⠉⠧','received':'⠗⠉⠧⠙','receiver':'⠗⠉⠧⠗','receivers':'⠗⠉⠧⠗⠎','receivership':'⠗⠉⠧⠗⠩⠊⠏','receiverships':'⠗⠉⠧⠗⠩⠊⠏⠎','receives':'⠗⠉⠧⠎','receiving':'⠗⠉⠧⠛','receivings':'⠗⠉⠧⠛⠎','rejoice':'⠗⠚⠉','rejoiced':'⠗⠚⠉⠙','rejoiceful':'⠗⠚⠉⠰⠇','rejoicefully':'⠗⠚⠉⠰⠇⠇⠽','rejoicefullys':'⠗⠚⠉⠰⠇⠇⠽⠎','rejoicefulness':'⠗⠚⠉⠰⠇⠰⠎','rejoicefulnesss':'⠗⠚⠉⠰⠇⠰⠎⠎','rejoicefuls':'⠗⠚⠉⠰⠇⠎','rejoicer':'⠗⠚⠉⠗','rejoicers':'⠗⠚⠉⠗⠎','rejoices':'⠗⠚⠉⠎','rejoicing':'⠗⠚⠉⠛','rejoicingly':'⠗⠚⠉⠛⠇⠽','rejoicinglys':'⠗⠚⠉⠛⠇⠽⠎','rejoicings':'⠗⠚⠉⠛⠎','reletter':'⠗⠑⠇⠗','relettered':'⠗⠑⠇⠗⠫','relettering':'⠗⠑⠇⠗⠬','reletterings':'⠗⠑⠇⠗⠬⠎','reletters':'⠗⠑⠇⠗⠎','repaid':'⠗⠑⠏⠙','repaids':'⠗⠑⠏⠙⠎','rightabout':'⠐⠗⠁⠃','rightabouts':'⠐⠗⠁⠃⠎','roundabout':'⠗⠨⠙⠁⠃','roundabouts':'⠗⠨⠙⠁⠃⠎','roustabout':'⠗⠳⠌⠁⠃','roustabouts':'⠗⠳⠌⠁⠃⠎','runabout':'⠗⠥⠝⠁⠃','runabouts':'⠗⠥⠝⠁⠃⠎','said':'⠎⠙','saidest':'⠎⠙⠑⠌','saidests':'⠎⠙⠑⠌⠎','saids':'⠎⠙⠎','saidst':'⠎⠙⠌','saidsts':'⠎⠙⠌⠎','scattergood':'⠎⠉⠁⠞⠞⠻⠛⠙','scattergoods':'⠎⠉⠁⠞⠞⠻⠛⠙⠎','schoolchildren':'⠎⠡⠕⠕⠇⠡⠝','schoolchildrens':'⠎⠡⠕⠕⠇⠡⠝⠎','schoolfriend':'⠎⠡⠕⠕⠇⠋⠗','schoolfriends':'⠎⠡⠕⠕⠇⠋⠗⠎','shall':'⠩','should':'⠩⠙','shoulda':'⠩⠙⠁','shouldas':'⠩⠙⠁⠎','shouldest':'⠩⠙⠑⠌','shouldests':'⠩⠙⠑⠌⠎','shoulds':'⠩⠙⠎','shouldst':'⠩⠙⠌','shouldsts':'⠩⠙⠌⠎','snowblind':'⠎⠝⠪⠃⠇','snowblindness':'⠎⠝⠪⠃⠇⠰⠎','snowblindnesses':'⠎⠝⠪⠃⠇⠰⠎⠑⠎','snowblindnessess':'⠎⠝⠪⠃⠇⠰⠎⠑⠎⠎','snowblindnesss':'⠎⠝⠪⠃⠇⠰⠎⠎','snowblinds':'⠎⠝⠪⠃⠇⠎','so':'⠎','somesch':'⠎⠕⠍⠑⠎⠉⠓','somesuch':'⠐⠎⠎⠡','somesuchs':'⠐⠎⠎⠡⠎','southabout':'⠎⠳⠹⠁⠃','southabouts':'⠎⠳⠹⠁⠃⠎','stepchildren':'⠌⠑⠏⠡⠝','stepchildrens':'⠌⠑⠏⠡⠝⠎','still':'⠌','stirabout':'⠌⠊⠗⠁⠃','stirabouts':'⠌⠊⠗⠁⠃⠎','struthiones':'⠌⠗⠥⠹⠊⠕⠝⠑⠎','sturiones':'⠌⠥⠗⠊⠕⠝⠑⠎','such':'⠎⠡','suchlike':'⠎⠡⠇⠊⠅⠑','suchlikes':'⠎⠡⠇⠊⠅⠑⠎','suchs':'⠎⠡⠎','supergood':'⠎⠥⠏⠻⠛⠙','supergoods':'⠎⠥⠏⠻⠛⠙⠎','superquick':'⠎⠥⠏⠻⠟⠅','superquicks':'⠎⠥⠏⠻⠟⠅⠎','tailfirst':'⠞⠁⠊⠇⠋⠌','tailfirsts':'⠞⠁⠊⠇⠋⠌⠎','that':'⠞','themselves':'⠮⠍⠧⠎','themselvess':'⠮⠍⠧⠎⠎','thereabout':'⠐⠮⠁⠃','thereabouts':'⠐⠮⠁⠃⠎','thereafter':'⠐⠮⠁⠋','thereafters':'⠐⠮⠁⠋⠎','thereagain':'⠐⠮⠁⠛','thereagains':'⠐⠮⠁⠛⠎','thereagainst':'⠐⠮⠁⠛⠌','thereagainsts':'⠐⠮⠁⠛⠌⠎','thereinafter':'⠐⠮⠔⠁⠋','thereinafters':'⠐⠮⠔⠁⠋⠎','thereinagain':'⠐⠮⠔⠁⠛','thereinagains':'⠐⠮⠔⠁⠛⠎','this':'⠹','thyself':'⠹⠽⠋','thyselfs':'⠹⠽⠋⠎','today':'⠞⠙','todays':'⠞⠙⠎','together':'⠞⠛⠗','togetherness':'⠞⠛⠗⠰⠎','togethernesss':'⠞⠛⠗⠰⠎⠎','togethers':'⠞⠛⠗⠎','tomorrow':'⠞⠍','tomorrows':'⠞⠍⠎','tonight':'⠞⠝','tonights':'⠞⠝⠎','turnabout':'⠞⠥⠗⠝⠁⠃','turnabouts':'⠞⠥⠗⠝⠁⠃⠎','unaccording':'⠥⠝⠁⠉','unaccordingly':'⠥⠝⠁⠉⠇⠽','unaccordinglys':'⠥⠝⠁⠉⠇⠽⠎','unaccordings':'⠥⠝⠁⠉⠎','unblindfold':'⠥⠝⠃⠇⠋⠕⠇⠙','unblindfolded':'⠥⠝⠃⠇⠋⠕⠇⠙⠫','unblindfolding':'⠥⠝⠃⠇⠋⠕⠇⠙⠬','unblindfoldings':'⠥⠝⠃⠇⠋⠕⠇⠙⠬⠎','unblindfolds':'⠥⠝⠃⠇⠋⠕⠇⠙⠎','unbraille':'⠥⠝⠃⠗⠇','unbrailled':'⠥⠝⠃⠗⠇⠙','unbrailles':'⠥⠝⠃⠗⠇⠎','undeceive':'⠥⠝⠙⠉⠧','undeceived':'⠥⠝⠙⠉⠧⠙','undeceiver':'⠥⠝⠙⠉⠧⠗','undeceivers':'⠥⠝⠙⠉⠧⠗⠎','undeceives':'⠥⠝⠙⠉⠧⠎','undeceiving':'⠥⠝⠙⠉⠧⠛','undeceivings':'⠥⠝⠙⠉⠧⠛⠎','undeclare':'⠥⠝⠙⠉⠇','undeclared':'⠥⠝⠙⠉⠇⠙','undeclares':'⠥⠝⠙⠉⠇⠎','underpaid':'⠐⠥⠏⠙','underpaids':'⠐⠥⠏⠙⠎','unfriend':'⠥⠝⠋⠗','unfriendlier':'⠥⠝⠋⠗⠇⠊⠻','unfriendliers':'⠥⠝⠋⠗⠇⠊⠻⠎','unfriendliest':'⠥⠝⠋⠗⠇⠊⠑⠌','unfriendliests':'⠥⠝⠋⠗⠇⠊⠑⠌⠎','unfriendliness':'⠥⠝⠋⠗⠇⠊⠰⠎','unfriendlinesses':'⠥⠝⠋⠗⠇⠊⠰⠎⠑⠎','unfriendlinessess':'⠥⠝⠋⠗⠇⠊⠰⠎⠑⠎⠎','unfriendlinesss':'⠥⠝⠋⠗⠇⠊⠰⠎⠎','unfriendly':'⠥⠝⠋⠗⠇⠽','unfriendlys':'⠥⠝⠋⠗⠇⠽⠎','unfriends':'⠥⠝⠋⠗⠎','unlettered':'⠥⠝⠇⠗⠫','unnecessary':'⠥⠝⠝⠑⠉','unnecessarys':'⠥⠝⠝⠑⠉⠎','unpaid':'⠥⠝⠏⠙','unpaids':'⠥⠝⠏⠙⠎','unperceive':'⠥⠝⠏⠻⠉⠧','unperceived':'⠥⠝⠏⠻⠉⠧⠙','unperceives':'⠥⠝⠏⠻⠉⠧⠎','unperceiving':'⠥⠝⠏⠻⠉⠧⠛','unperceivings':'⠥⠝⠏⠻⠉⠧⠛⠎','unquick':'⠥⠝⠟⠅','unquicks':'⠥⠝⠟⠅⠎','unreceived':'⠥⠝⠗⠉⠧⠙','unrejoice':'⠥⠝⠗⠚⠉','unrejoiced':'⠥⠝⠗⠚⠉⠙','unrejoiceful':'⠥⠝⠗⠚⠉⠰⠇','unrejoicefully':'⠥⠝⠗⠚⠉⠰⠇⠇⠽','unrejoicefullys':'⠥⠝⠗⠚⠉⠰⠇⠇⠽⠎','unrejoicefulness':'⠥⠝⠗⠚⠉⠰⠇⠰⠎','unrejoicefulnesss':'⠥⠝⠗⠚⠉⠰⠇⠰⠎⠎','unrejoicefuls':'⠥⠝⠗⠚⠉⠰⠇⠎','unrejoicer':'⠥⠝⠗⠚⠉⠗','unrejoicers':'⠥⠝⠗⠚⠉⠗⠎','unrejoices':'⠥⠝⠗⠚⠉⠎','unrejoicing':'⠥⠝⠗⠚⠉⠛','unrejoicingly':'⠥⠝⠗⠚⠉⠛⠇⠽','unrejoicinglys':'⠥⠝⠗⠚⠉⠛⠇⠽⠎','unrejoicings':'⠥⠝⠗⠚⠉⠛⠎','unrepaid':'⠥⠝⠗⠑⠏⠙','unrepaids':'⠥⠝⠗⠑⠏⠙⠎','unsaid':'⠥⠝⠎⠙','unsaids':'⠥⠝⠎⠙⠎','us':'⠥','very':'⠧','walkabout':'⠺⠁⠇⠅⠁⠃','walkabouts':'⠺⠁⠇⠅⠁⠃⠎','wellpaid':'⠺⠑⠇⠇⠏⠙','wellpaids':'⠺⠑⠇⠇⠏⠙⠎','westabout':'⠺⠑⠌⠁⠃','westabouts':'⠺⠑⠌⠁⠃⠎','whereabout':'⠐⠱⠁⠃','whereabouts':'⠐⠱⠁⠃⠎','whereafter':'⠐⠱⠁⠋','whereafters':'⠐⠱⠁⠋⠎','whereagain':'⠐⠱⠁⠛','whereagains':'⠐⠱⠁⠛⠎','whereagainst':'⠐⠱⠁⠛⠌','whereagainsts':'⠐⠱⠁⠛⠌⠎','whereinafter':'⠐⠱⠔⠁⠋','whereinafters':'⠐⠱⠔⠁⠋⠎','whereinagain':'⠐⠱⠔⠁⠛','whereinagains':'⠐⠱⠔⠁⠛⠎','which':'⠱','will':'⠺','womanfriend':'⠺⠕⠍⠁⠝⠋⠗','womanfriends':'⠺⠕⠍⠁⠝⠋⠗⠎','womenfriends':'⠺⠕⠍⠢⠋⠗⠎','womenfriendss':'⠺⠕⠍⠢⠋⠗⠎⠎','would':'⠺⠙','woulda':'⠺⠙⠁','wouldas':'⠺⠙⠁⠎','wouldest':'⠺⠙⠑⠌','wouldests':'⠺⠙⠑⠌⠎','woulds':'⠺⠙⠎','wouldst':'⠺⠙⠌','wouldsts':'⠺⠙⠌⠎','you':'⠽','your':'⠽⠗','yours':'⠽⠗⠎','yourself':'⠽⠗⠋','yourselfs':'⠽⠗⠋⠎','yourselves':'⠽⠗⠧⠎','yourselvess':'⠽⠗⠧⠎⠎'};

// ════════════════════════════════════════════════════════════
//  二、類別定義（對應 braille-translate.htm 的勾選面板）
// ════════════════════════════════════════════════════════════

const WS_ALPHA_WORDS = ['but','can','do','every','from','go','have','just',
    'knowledge','like','more','not','people','quite','rather','so','that',
    'us','very','will','it','you','as'];
const WS_ALPHA_SET = new Set(WS_ALPHA_WORDS);

const WS_STRONG_WORDS = ['child','shall','this','which','out','still'];
const WS_STRONG_SET = new Set(WS_STRONG_WORDS);

// 每個 group 包含若干 item（對應一個 checkbox）
// item.key     → 傳入 buildFilteredTables 的 enabledSet 識別碼
// item.label   → UI 顯示文字
// item.desc    → 補充說明（可選）
// item.patterns / item.words → 該規則涵蓋的 key（供 query 標示規則說明用）
const UEB_GROUPS = [
    {
        key: 'grp_alpha',
        label: 'ALPHABETIC WORDSIGNS（字母單字縮寫）',
        items: [
            { key: 'ws_alpha', label: '字母整詞縮寫',
              desc: 'b=but, c=can, d=do, e=every, f=from, g=go, h=have, j=just, k=knowledge, l=like, m=more, n=not, p=people, q=quite, r=rather, s=so, t=that, u=us, v=very, w=will, x=it, y=you, z=as',
              words: WS_ALPHA_WORDS }
        ]
    },
    {
        key: 'grp_strong',
        label: 'STRONG WORDSIGNS & GROUPSIGNS（強縮寫）',
        items: [
            { key: 'strong_contractions', label: 'Strong Contractions',
              desc: 'and, for, of, the, with',
              patterns: ['and','for','of','the','with'] },
            { key: 'ws_strong', label: 'Strong Wordsigns',
              desc: 'child, shall, this, which, out, still',
              words: WS_STRONG_WORDS },
            { key: 'gs_ch_sh', label: 'Strong Groupsigns (1)',
              desc: 'ch, sh, th, wh, ou, st, gh',
              patterns: ['ch','sh','th','wh','ou','st','gh'] },
            { key: 'gs_ed_er', label: 'Strong Groupsigns (2)',
              desc: 'ed, er, ow, ar, ing',
              patterns: ['ed','er','ow','ar','ing'] }
        ]
    },
    {
        key: 'grp_lower',
        label: 'LOWER GROUPSIGNS & WORDSIGNS（低位縮寫）',
        items: [
            { key: 'lg_ea_bb', label: 'Lower Groupsigns (mid)',
              desc: 'ea, bb, cc, ff, gg',
              patterns: ['ea','bb','cc','ff','gg'] },
            { key: 'lg_con_dis', label: 'Lower Groupsigns (beg)',
              desc: 'con, dis, be（字首）',
              patterns: ['con','dis','be'] },
            { key: 'lg_en_in', label: 'Lower Groupsigns (any)',
              desc: 'en, in（任何位置）',
              patterns: ['en','in'] },
            { key: 'lw_words', label: 'Lower Wordsigns',
              desc: 'be, enough, were, his, in, was',
              words: ['be','enough','were','his','in','was'] }
        ]
    },
    {
        key: 'grp_suffix',
        label: 'FINAL-LETTER GROUPSIGNS（字尾組合符號）',
        items: [
            { key: 'suffix_dot46', label: 'dots-46 (⠨) 前綴',
              desc: 'sion, ance, ound, ount, less',
              patterns: ['sion','ance','ound','ount','less'] },
            { key: 'suffix_dot56', label: 'dots-56 (⠰) 前綴',
              desc: 'tion, ence, ment, ness, ful, ity, ong',
              patterns: ['tion','ence','ment','ness','ful','ity','ong'] }
        ]
    },
    {
        key: 'grp_word',
        label: 'WORD CONTRACTIONS（整詞縮寫）',
        items: [
            { key: 'init_con', label: 'Initial-letter Contractions（首字母縮寫）',
              desc: 'day, here, name, one, part, right, some, there, through, time, under, where, work, young, upon, these, those, whose, word, their, many, spirit, world, had…' },
            { key: 'shortform', label: 'Shortform Words（簡短字形）',
              desc: 'about, according, after, almost, already, also, although, always, because, before, blind, children, could, first, friend, good, great, little, much, necessary, quick, receive, should, today, together, would…' }
        ]
    }
];

// 快速查詢：rule key → category item key（供 query 標示規則說明用）
// 涵蓋 G2_ALWAYS / G2_ANYWHERE / G2_BEGWORD / G2_MIDWORD / G2_MIDEND 的 pattern key
const RULE_CATEGORY_MAP = (() => {
    const m = {};
    for (const g of UEB_GROUPS) {
        for (const item of g.items) {
            for (const p of (item.patterns || item.words || [])) {
                m[p] = item.key;
            }
        }
    }
    // ing 同時出現在 gs_ed_er 和 G2_MIDEND，以 gs_ed_er 為主
    return m;
})();

function getCategoryKey(ruleKey) {
    return RULE_CATEGORY_MAP[ruleKey] ?? null;
}

// ════════════════════════════════════════════════════════════
//  三、buildFilteredTables（braille-translate.htm ueb-custom 模式用）
//  參數 enabledSet: Set<string>，包含啟用的 item.key
//  回傳: { always, anywhere, begword, midword, midend, lowword, sufword, word }
// ════════════════════════════════════════════════════════════

function buildFilteredTables(enabledSet) {
    const en = enabledSet;

    let always = {};
    if (en.has('strong_contractions')) {
        for (const k of ['and','for','of','the','with']) {
            if (G2_ALWAYS[k]) always[k] = G2_ALWAYS[k];
        }
    }
    if (en.has('gs_ch_sh')) {
        for (const k of ['ch','sh','th','wh','ou','st','gh']) {
            if (G2_ALWAYS[k]) always[k] = G2_ALWAYS[k];
        }
    }
    if (en.has('gs_ed_er')) {
        for (const k of ['ed','er','ow','ar','ing']) {
            if (G2_ALWAYS[k]) always[k] = G2_ALWAYS[k];
        }
    }
    if (en.has('word_contractions')) {
        for (const [k,v] of Object.entries(G2_ALWAYS)) {
            if (!always[k]) always[k] = v;
        }
    }

    let anywhere = {};
    if (en.has('lg_en_in')) Object.assign(anywhere, G2_ANYWHERE);

    let begword = {};
    if (en.has('lg_con_dis')) Object.assign(begword, G2_BEGWORD);

    let midword = {};
    if (en.has('lg_ea_bb')) Object.assign(midword, G2_MIDWORD);

    let midend = {};
    if (en.has('suffix_dot46')) {
        for (const k of ['sion','ance','ound','ount','less']) {
            if (G2_MIDEND[k]) midend[k] = G2_MIDEND[k];
        }
    }
    if (en.has('suffix_dot56')) {
        for (const k of ['tion','ence','ment','ness','ful','ity','ong']) {
            if (G2_MIDEND[k]) midend[k] = G2_MIDEND[k];
        }
    }
    if (en.has('gs_ed_er') && G2_MIDEND['ing']) {
        midend['ing'] = G2_MIDEND['ing'];
    }

    let lowword = {};
    if (en.has('lw_words')) Object.assign(lowword, G2_LOWWORD);

    let sufword = {};
    if (en.has('lg_con_dis')) Object.assign(sufword, G2_SUFWORD);

    let word = {};
    if (en.has('ws_alpha')) {
        for (const w of WS_ALPHA_WORDS) {
            if (G2_WORD[w]) word[w] = G2_WORD[w];
        }
    }
    if (en.has('ws_strong')) {
        for (const w of WS_STRONG_WORDS) {
            if (G2_WORD[w]) word[w] = G2_WORD[w];
        }
    }
    if (en.has('init_con')) {
        for (const [k, v] of Object.entries(G2_WORD)) {
            if (v.startsWith('⠐') || v.startsWith('⠘') || v.startsWith('⠸')) word[k] = v;
        }
        for (const [k, v] of Object.entries(G2_ALWAYS)) {
            if (v.startsWith('⠐') || v.startsWith('⠘') || v.startsWith('⠸')) always[k] = v;
        }
    }
    if (en.has('shortform')) {
        for (const [k, v] of Object.entries(G2_WORD)) {
            if (v.startsWith('⠐') || v.startsWith('⠘') || v.startsWith('⠸')) continue;
            if (WS_ALPHA_SET.has(k) || WS_STRONG_SET.has(k)) continue;
            word[k] = v;
        }
    }

    return { always, anywhere, begword, midword, midend, lowword, sufword, word };
}

// ════════════════════════════════════════════════════════════
//  四、blocksEaGroupsign — re-/pre- 前綴阻止 ea lower groupsign
//  來源：liblouis en-ueb-g2.ctb lines 928–980 match 規則翻譯
//  邏輯：整詞以特定前綴起頭 → ea 跨形態邊界 → 不縮
// ════════════════════════════════════════════════════════════

const _BLOCKED_EA = [
    // pre- prefix（不用 'prea' 整批：會破壞 preach/preachable 等根詞）
    'preadm',                  // preadmit, preadmission
    'preapp','preap',          // preapprove, preappoint, preapplication
    // re- prefix
    'reab',                    // line 929: reabsorb
    'reacc','reack','reacq',   // line 930: reaccustom, reacknowledge
    'reacid',                  // line 933: reacidify
    'react',                   // line 934: react ALL derivatives（最重要）
    'readap','readd','readj',  // lines 935-938: readapt, readdress, readjust
    'readm',                   // line 941: readmit（readme/readmes 在例外表）
    'reado',                   // line 944: readopt（readonly/readout 在例外表）
    'readv',                   // line 945: readvance
    'reaer',                   // line 946: reaerate
    'reaff',                   // line 947: reaffirm
    'reagen','reagg',          // lines 949-950: reagent, reaggregate
    'realig','reall',          // lines 956-957: realign, realloc（really 在例外表）
    'rean',                    // line 964: reanimate, reanalyze
    'reapp',                   // line 966: reappear
    'reass','reasc','reast',   // line 967: reassure, reascend（reasty 在例外表）
    'reatt',                   // line 969: reattach
    'reaw',                    // line 977: reawaken
    'reav',                    // line 976: reavail（reave/reaved/reaves/reaving 在例外表）
];

// 前綴命中但保留 ea 的整詞（對應 liblouis sufword/word 覆寫）
const _EA_UNBLOCKED = new Set([
    'really',
    'reasty',
    'reave','reaved','reaves','reaving',
    'readme','readmes',
    'readonly','readout',
]);

function blocksEaGroupsign(word) {
    const lw = word.toLowerCase();
    if (_EA_UNBLOCKED.has(lw)) return false;
    for (const p of _BLOCKED_EA) { if (lw.startsWith(p)) return true; }
    return false;
}

// ════════════════════════════════════════════════════════════
//  五、blocksConBegword / blocksDisBegword
//  來源：liblouis en-ueb-g2.ctb lines 852–875 match 規則翻譯
// ════════════════════════════════════════════════════════════

function blocksConBegword(word) {
    const lw = word.toLowerCase();
    if (lw.length <= 3) return false;
    const ch = lw[3];
    if (ch === 'e' && !(lw[4] === 's' && lw[5] === 't')) return true; // cone → block; contest → allow
    if (ch === 'k') return true;                                        // conk
    if (ch === 'c' && lw[4] === 'h') return true;                      // conch
    if (ch === 's' && !/[a-z]/.test(lw[4] || '')) return true;         // cons (無後綴音節) → block
    return false;
}

function blocksDisBegword(word) {
    const lw = word.toLowerCase();
    if (lw.length <= 3) return false;
    const ch = lw[3];
    if (ch === 'k') return true;                                                // disk, diskette
    if (ch === 'h' && 'bcdfghiklmnprtw'.includes(lw[4] || '')) return true;    // dishwasher, dishcloth…
    if (ch === 'p' && lw[4] === 'i') return true;                               // dispirited
    return false;
}

// ════════════════════════════════════════════════════════════
//  六、blocksOfAlways — 科學前綴 + f/w 阻止 of 縮寫
//  來源：liblouis en-ueb-g2.ctb lines 311–348 match 規則
//  例：autofocus/microfilm/photofluorography → of 不縮
// ════════════════════════════════════════════════════════════

const _OF_BLOCKED_PREFIXES = new Set([
    'aero','antero','auto','benzo','bio','chloro','deutero',
    'electro','fibro','fluoro','galvano','griseo','hetero','homo',
    'hydro','hypo','kilo','luteo','macro','micro','mono','myelo',
    'myo','nano','nitro','octo','photo','pico','proto','pseudo',
    'psycho','retro','sulfo','sulpho','synchro','thermo','ventro'
]);

// pos = 'of' 的起始位置（即 'o' 的 index）
function blocksOfAlways(word, pos) {
    const lw = word.toLowerCase();
    if (lw[pos] !== 'o') return false;
    const next = lw[pos + 1] || '';
    if (next !== 'f' && next !== 'w') return false;
    return _OF_BLOCKED_PREFIXES.has(lw.slice(0, pos + 1));
}

// ════════════════════════════════════════════════════════════
//  七、blocksCrossCompound — 複合詞跨形態邊界阻止 th/wh/sh
//  來源：liblouis LL_MATCH 中 isAlpha:true 的 sufword/match 條目
//  例：pothole(th)、rawhide(wh)、transhuman(sh)
// ════════════════════════════════════════════════════════════

// 以「contraction 的 't'/'w'/'s' 位置（含）前的詞幹」為索引鍵
const _TH_BLOCKED_STEMS = new Set(['pot','adult','boat','bolt','flat','rat','coat']);
const _WH_BLOCKED_STEMS = new Set(['raw']);
const _SH_BLOCKED_STEMS = new Set(['trans']);

// k = 縮寫鍵（'th'/'wh'/'sh'）, pos = 在整詞中的起始 index
function blocksCrossCompound(k, word, pos) {
    const lw = word.toLowerCase();
    if (k === 'th') {
        // 通用：th 後接 ood/ouse（adulthood, boathouse, knighthood…）
        const after = lw.slice(pos + 2);
        if (after.startsWith('ood') || after.startsWith('ouse')) return true;
        // 明確詞幹：pot/bolt/flat/rat/coat + hole/head…
        return _TH_BLOCKED_STEMS.has(lw.slice(0, pos + 1));
    }
    if (k === 'wh') return _WH_BLOCKED_STEMS.has(lw.slice(0, pos + 1));
    if (k === 'sh') return _SH_BLOCKED_STEMS.has(lw.slice(0, pos + 1));
    return false;
}

// ════════════════════════════════════════════════════════════
//  七B、各 always 縮寫阻止函式（gh / here / ever / mother /
//       one / under / had / st）
//  來源：liblouis en-ueb-g2.ctb + query inline logic
//  pos  = 縮寫在整詞中的起始位置
//  isProper = 是否為專有名詞（預設 false，bt 不偵測此值）
// ════════════════════════════════════════════════════════════

function blocksGhAlways(word, pos) {
    const lw = word.toLowerCase();
    const bc = pos > 0 ? lw[pos - 1] : '';
    if (bc === 'n') return true;                         // ng+h: bunghole, longhaired
    const after = lw.slice(pos + 2);
    return after.startsWith('ood') || after.startsWith('ouse'); // doghood, bughouse
}

function blocksHereAlways(word, pos) {
    const lw = word.toLowerCase();
    const bc = pos > 0 ? lw[pos - 1] : '';
    const suf = lw.slice(pos + 4);
    if (suf[0] === 's' && 'iy'.includes(suf[1] || '')) return true; // heresy, heresies
    if (suf.startsWith('tic')) return true;                          // heretic, heretical
    // here 夾在字中（非字頭、非字尾）且前接子音 → 跨音節（atmosphere, hemisphere）
    if (pos > 0 && pos + 4 < lw.length && bc && !'aeiouy'.includes(bc)) return true;
    return false;
}

function blocksEverAlways(word, pos, isProper) {
    const lw = word.toLowerCase();
    const bc = pos > 0 ? lw[pos - 1] : '';
    const ac = lw[pos + 4] || '';
    if (bc === 'e' || bc === 'i') return true;           // lever, river, fever
    if (ac === 'e' && !isProper) return true;            // severe, revere（非專有名詞）
    return false;
}

function blocksMotherAlways(word, pos) {
    const bc = pos > 0 ? word.toLowerCase()[pos - 1] : '';
    return bc === 'e';                                   // chemotherapy
}

function blocksOneAlways(word, pos, isProper) {
    const lw = word.toLowerCase();
    const bc = pos > 0 ? lw[pos - 1] : '';
    const ac  = lw[pos + 3] || '';
    const ac2 = lw[pos + 4] || '';
    if (bc === 'o') return true;                                             // moone, boone
    if (ac === 'd' || ac === 'r') return true;                               // boned, donor
    if (ac === 'n' && lw.includes('oness')) return true;                     // baroness
    if (ac && 'aeiou'.includes(ac)) return true;                             // pioneer, ionetic
    if (ac === 's' && ac2 && 'aeiou'.includes(ac2)) return true;             // Cantonese
    if (ac && 'gltc'.includes(ac) && (!ac2 || 'aeiou'.includes(ac2))) return true; // Conestoga
    if (isProper && pos > 0 && !ac) {
        if (bc && 'aeiouy'.includes(bc)) return true;                        // Dione, Alcyone
        const bc2 = pos >= 2 ? lw[pos - 2] : '';
        if (bc === 'h' && 'psct'.includes(bc2)) return true;                 // Persephone, Shoshone
    }
    return false;
}

function blocksUnderAlways(word, pos) {
    const bc = pos > 0 ? word.toLowerCase()[pos - 1] : '';
    return bc === 'a' || bc === 'o';                     // launder, flounder
}

function blocksHadAlways(word, pos) {
    const ac = word.toLowerCase()[pos + 3] || '';
    return pos === 0 && ac === 'r';                      // Hadrian
}

function blocksStAlways(word, pos, isProper) {
    const lw = word.toLowerCase();
    // 希臘字根 aesth/anesth/asthm → 優先縮 th，不縮 st
    if (lw[pos + 2] === 'h') {
        if (lw.startsWith('aesth')  && pos === 1) return true;
        if (lw.startsWith('anesth') && pos === 2) return true;
        if (lw.startsWith('asthm')  && pos === 1) return true;
    }
    // st 後接 ion → 讓 tion 縮寫優先（MIDEND）
    if (lw.startsWith('ion', pos + 2)) return true;
    // 專有名詞：stown（Cookstown）、stag（Bundestag）字尾
    if (isProper && pos > 0) {
        if (lw.slice(pos, pos + 5) === 'stown') return true;
        if (lw.slice(pos, pos + 5) === 'stag')  return true;
    }
    return false;
}

// ════════════════════════════════════════════════════════════
//  八、getCategoryLabel — 供 query 規則說明顯示使用
//  輸入 item key（如 'gs_ch_sh'），回傳可顯示的類別名稱
// ════════════════════════════════════════════════════════════

const _ITEM_LABEL = (() => {
    const m = {};
    for (const g of UEB_GROUPS) {
        for (const item of g.items) {
            m[item.key] = { label: item.label, group: g.label };
        }
    }
    return m;
})();

function getCategoryLabel(itemKey) {
    return _ITEM_LABEL[itemKey] ?? null;  // { label, group } or null
}

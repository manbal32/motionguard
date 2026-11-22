// Optional self-reported 18-hole result; never coerce a missing value to a score.
export function readRecentRoundScore(value){if(value===undefined||value===null||value==='')return undefined;if(!Number.isInteger(value)||value<54||value>200)throw Error('최근 라운드 타수는 18홀 기준 54~200 사이의 정수로 입력해 주세요.');return value;}

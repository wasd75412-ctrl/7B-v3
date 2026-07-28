export function highestWinStreak(results=[]){
  let current=0;
  let highest=0;

  for(const result of results){
    if(result===true||result?.won===true){
      current++;
      highest=Math.max(highest,current);
    }else{
      current=0;
    }
  }

  return highest;
}

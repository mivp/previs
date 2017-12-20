import { environment } from '../../environments/environment';

export class Dataset {
  tag: string;
  type: string;
  size: string;
  dateStr: string;
  imgUrl: string;
  viewUrl: string;
  
  constructor() { 
    this.clear();
  }
  
  clear() {
    this.tag = '';
    this.type = '';
    this.dateStr = '';
    this.size = '';
    this.imgUrl = '';
    this.viewUrl = '';
  }

  parseResult(data) {
    console.log('parseResult');
    console.log(data);
    var result = data.result;
    if(data.status === 'done' && result) {
      this.tag = result.tag;
      this.type = result.type;
      this.size = result.volumes[0].res.toString();
      let d = new Date(result.date);
      this.dateStr = d.toString();
      if (this.type === 'volume') {
        this.imgUrl =  environment.ws_url + '/' + result.volumes[0].thumb;  
        this.viewUrl = environment.ws_url + '/sharevol/index.html?data=' + result.volumes[0].json_web + '&reset';
      } 
      else if (this.type === 'mesh') {
        this.imgUrl = 'assets/img/no-image-box.png';
        this.viewUrl = environment.ws_url + '/viewer?tag=data/tags/' + result.tag + '/mesh_result';
        this.size = 'not available';
      }
      else if (this.type === 'point') {
        this.imgUrl = 'assets/img/no-image-box.png';
        this.viewUrl = environment.ws_url + '/data/tags/' + result.tag + '/point_result/potree.html';
      }
    }
    else {
      this.clear();
    }
  }
  
}
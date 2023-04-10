Here is the output from running the `create-dataset.js` script

```
Total labels => count: 20556, length: 186.1 hours, average length: 32.60
Usable labels => count: 7100, length: 25.2 hours, average length: 12.75
Used labels => count: 5506, length: 20.0 hours, average length: 13.08
{
  paragraph: 2930,
  gatha: 1574,
  centered: 445,
  heading: 530,
  unindented: 27
}
characters=" !#'(),-.:;?abcdeghijklmnoprstuvxyñāīūḍḷṁṅṇṭ"
characters=" !#'(),-.:;?xංඅආඉඊඋඌඑඔකඛගඝඞචඡජඣඤටඨඩඪණතථදධනපඵබභමයරලවසහළ්ාිීුූෙො"
create dataset using "tar -cjf pali_dataset.tar.bz2 wavs metadata.csv"
Extracted audio from flac files in 46.56 seconds
```

In the releases you can find the tar archive with all the wav files. You can download it and extract it as follows
```
cat pali_dataset.tar.bz2.part* > pali_dataset.tar.bz2
tar -xjf pali_dataset.tar.bz2
```
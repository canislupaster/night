const NowPlaying = ({
  fishData,
  songData
}: {
  fishData: string
  songData: any
}) => {
  return (
    <div className="flex flex-col justify-start">
      <div className="flex flex-col items-center justify-center text-center mt-8 ml-8 w-10/12">
        <img src={songData.image} className="rounded-lg" />
        <p className="font-bold text-4xl mt-4 mb-2">{songData.title}</p>
        <p className="text-xl text-gray-300">{songData.artist}</p>
      </div>
    </div>
  )
}

export default NowPlaying

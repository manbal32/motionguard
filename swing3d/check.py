"""Check the prerequisites for offline Swing3D video analysis."""
import socket
import sys

from video_pose import ExtractionError, ensure_model


def check():
    problems = 0
    version = ".".join(map(str, sys.version_info[:3]))
    if sys.version_info >= (3, 9):
        print(f"[정상] Python {version}")
    else:
        print(f"[조치] Python {version}. Python 3.11 또는 3.12를 설치하고 다시 실행하세요.")
        problems += 1

    try:
        import cv2
        import mediapipe
        from mediapipe.tasks.python import vision
        print(f"[정상] MediaPipe {mediapipe.__version__}, OpenCV {cv2.__version__}")
    except (ImportError, OSError) as error:
        print(f"[조치] 영상 패키지를 불러오지 못했습니다. py -3 -m pip install mediapipe opencv-contrib-python 을 실행하세요. ({error})")
        problems += 1

    try:
        model = ensure_model()
        print(f"[정상] 자세 모델 {model.name}, {model.stat().st_size:,}바이트")
    except ExtractionError as error:
        print(f"[조치] {error}")
        problems += 1

    with socket.socket() as listener:
        try:
            listener.bind(("127.0.0.1", 8765))
            print("[정상] 포트 8765 사용 가능")
        except OSError:
            print("[조치] 포트 8765를 사용할 수 없습니다. 실행 중인 Swing3D나 해당 포트의 프로그램을 종료하세요.")
            problems += 1
    return int(problems > 0)


if __name__ == "__main__":
    raise SystemExit(check())
